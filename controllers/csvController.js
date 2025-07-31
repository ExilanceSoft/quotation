const csv = require('csv-parser');
const { Readable } = require('stream');
const Model = require('../models/ModelModel');
const Header = require('../models/HeaderModel');
const Branch = require('../models/Branch');
const AppError = require('../utils/appError');
const logger = require('../config/logger');
const { stringify } = require('csv-stringify');

// Helper function to clean and parse values
const cleanValue = (value) => {
  if (!value) return null;
  const strValue = value.toString().trim();
  if (strValue === '') return null;

  // Try to parse as number
  const numValue = parseFloat(strValue.replace(/,/g, ''));
  if (!isNaN(numValue)) return numValue;

  return strValue;
};

exports.exportCSVTemplate = async (req, res, next) => {
  try {
    // Validate request query parameters
    const { type, branch_id } = req.query;
    if (!type || !['EV', 'ICE'].includes(type.toUpperCase())) {
      return next(new AppError('Type is required and must be either EV or ICE', 400));
    }
    if (!branch_id) {
      return next(new AppError('Branch ID is required', 400));
    }

    const normalizedType = type.toUpperCase();

    // Verify branch exists
    const branch = await Branch.findById(branch_id);
    if (!branch) {
      return next(new AppError('Branch not found', 404));
    }

    // Fetch required data from database
    const [headers, models] = await Promise.all([
      Header.find({ type: normalizedType })
        .sort({ priority: 1 })
        .lean(),
      Model.find({
        type: normalizedType,
        status: 'active'
      })
        .populate({
          path: 'prices.header_id',
          model: 'Header',
          select: '_id category_key header_key'
        })
        .populate({
          path: 'prices.branch_id',
          model: 'Branch',
          select: '_id name'
        })
        .lean()
    ]);

    // Prepare CSV data structure
    const csvData = [];

    // 1. Add branch information row
    const branchRow = [];
    branchRow.push('Branch');
    branchRow.push(branch.name);
    // Fill remaining columns with empty values
    for (let i = 2; i < headers.length + 1; i++) {
      branchRow.push('');
    }
    csvData.push(branchRow);

    // 2. Add type row
    const typeRow = [];
    typeRow.push('Type');
    typeRow.push(normalizedType);
    // Fill remaining columns with empty values
    for (let i = 2; i < headers.length + 1; i++) {
      typeRow.push('');
    }
    csvData.push(typeRow);

    // 3. Add headers row (header_key first)
    const headerRow = ['model_name'];
    headers.forEach(header => {
      headerRow.push(`${header.header_key}|${header.category_key}`);
    });
    csvData.push(headerRow);

    // 4. Add model data rows
    if (models.length > 0) {
      models.forEach(model => {
        const modelRow = [model.model_name];
        headers.forEach(header => {
          const price = model.prices.find(p =>
            p.header_id &&
            p.header_id._id.toString() === header._id.toString() &&
            p.branch_id &&
            p.branch_id._id.toString() === branch_id.toString()
          );
          modelRow.push(price ? price.value : '0');
        });
        csvData.push(modelRow);
      });
    } else {
      // Add sample row if no models exist
      const sampleRow = ['SampleModel'];
      headers.forEach(() => {
        sampleRow.push('0');
      });
      csvData.push(sampleRow);
    }

    // Configure CSV stringifier
    const stringifier = stringify({
      header: false,
      delimiter: ',',
      quoted: true,
      quoted_empty: true,
      quoted_string: true,
      escape: '"',
      bom: true
    });

    // Set response headers
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${branch.name.replace(/\s+/g, '_')}_${normalizedType}_export_${Date.now()}.csv`
    );

    // Stream CSV to response
    stringifier.pipe(res);

    // Write data to stringifier
    csvData.forEach(row => stringifier.write(row));
    stringifier.end();

  } catch (err) {
    logger.error(`Error exporting CSV template: ${err.message}`, {
      stack: err.stack,
      request: req.body
    });
    next(new AppError('Failed to generate CSV template. Please try again later.', 500));
  }
};

exports.importCSV = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('No CSV file uploaded', 400));
    }

    // Validate inputs
    if (!req.body.branch_id) {
      return next(new AppError('Branch ID is required', 400));
    }
    if (!req.body.type || !['EV', 'ICE'].includes(req.body.type.toUpperCase())) {
      return next(new AppError('Type is required and must be EV or ICE', 400));
    }
    const type = req.body.type.toUpperCase();

    // Verify branch exists
    const branch = await Branch.findById(req.body.branch_id);
    if (!branch) {
      return next(new AppError('Branch not found', 404));
    }

    // Get headers for type
    const headers = await Header.find({ type });
    const headerKeyMap = new Map(headers.map(h => [h.header_key, h._id]));
    const categoryKeyMap = new Map(headers.map(h => [h.category_key, h._id]));

    // Parse CSV
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);

    const csvData = [];
    const errors = [];
    let processedCount = 0;
    let headerRow = null;

    bufferStream
      .pipe(csv({ separator: ',', headers: false, skipLines: 0 }))
      .on('data', (row) => {
        csvData.push(Object.values(row).map(val => val.toString().trim()));
      })
      .on('end', async () => {
        try {
          // Validate CSV structure - at least 3 rows (info, type, and header)
          if (csvData.length < 3) {
            return next(new AppError('CSV must contain at least branch info, type, and header rows', 400));
          }

          // Find header row (first row starting with 'model_name')
          const headerRowIndex = csvData.findIndex(row => row[0]?.toLowerCase() === 'model_name');
          if (headerRowIndex === -1) {
            return next(new AppError('CSV must contain a header row starting with model_name', 400));
          }

          headerRow = csvData[headerRowIndex];
          const dataRows = csvData.slice(headerRowIndex + 1);

          // Process each model
          for (const row of dataRows) {
            const modelName = row[0]?.trim();
            if (!modelName || modelName === 'SampleModel') continue;

            try {
              // Find or create model
              let model = await Model.findOne({ model_name: modelName }) ||
                new Model({
                  model_name: modelName,
                  type,
                  status: 'active',
                  prices: []
                });

              // Clear existing prices for this branch
              model.prices = model.prices.filter(p => !p.branch_id.equals(branch._id));

              // Process each price column
              for (let i = 1; i < headerRow.length; i++) {
                const headerParts = headerRow[i]?.split('|');
                const headerKey = headerParts[0]?.trim();
                const categoryKey = headerParts[1]?.trim();
                const value = cleanValue(row[i]);

                // Find header ID - try header_key first, then category_key
                let headerId = headerKeyMap.get(headerKey);
                if (!headerId && categoryKey) {
                  headerId = categoryKeyMap.get(categoryKey);
                }

                if (headerId && value !== null) {
                  model.prices.push({
                    value: value,
                    header_id: headerId,
                    branch_id: branch._id
                  });
                }
              }

              await model.save();
              processedCount++;
            } catch (err) {
              errors.push(`Error processing model ${modelName}: ${err.message}`);
            }
          }

          res.status(200).json({
            status: 'success',
            message: 'CSV import completed',
            imported: processedCount,
            errors: errors.length > 0 ? errors : undefined
          });
        } catch (err) {
          next(err);
        }
      });
  } catch (err) {
    logger.error(`Error importing CSV: ${err.message}`);
    next(err);
  }
};