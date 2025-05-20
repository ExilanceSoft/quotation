const csv = require('csv-parser');
const { Readable } = require('stream');
const Model = require('../models/ModelModel');
const Header = require('../models/HeaderModel');
const Branch = require('../models/Branch');
const AppError = require('../utils/appError');
const logger = require('../config/logger');

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

// exports.exportCSVTemplate = async (req, res, next) => {


//   try {
//     const headers = await Header.find().sort({ category_key: 1, priority: 1 });
//     const models = await Model.find().populate('prices.header_id');

//     // Prepare CSV content
//     let csvContent = '';
//     const categoryRow = ['model_name'];
//     const headerRow = ['-'];
    
//     headers.forEach(header => {
//       categoryRow.push(header.category_key);
//       headerRow.push(header.header_key);
//     });

//     csvContent += categoryRow.join(',') + '\n';
//     csvContent += headerRow.join(',') + '\n';

//     models.forEach(model => {
//       const row = [model.model_name];
      
//       headers.forEach(header => {
//         const priceData = model.prices.find(p => 
//           p.header_id && p.header_id._id.equals(header._id)
//         );
//         const value = priceData ? priceData.value : '';
//         row.push(value);
//       });

//       csvContent += row.join(',') + '\n';
//     });

//     res.setHeader('Content-Type', 'text/csv');
//     res.setHeader('Content-Disposition', 'attachment; filename=models_prices_export.csv');
//     res.status(200).send(csvContent);
//   } catch (err) {
//     logger.error(`Error exporting CSV template: ${err.message}`);
//     next(err);
//   }
// };

// exports.importCSV = async (req, res, next) => {
//   try {
//     if (!req.file) {
//       return next(new AppError('No CSV file uploaded', 400));
//     }

//     // Check if branch_id is provided
//     if (!req.body.branch_id) {
//       return next(new AppError('Branch ID is required', 400));
//     }

//     // Verify branch exists
//     const branch = await Branch.findById(req.body.branch_id);
//     if (!branch) {
//       return next(new AppError('Branch not found', 404));
//     }

//     // Get all headers and create maps
//     const headers = await Header.find();
//     const headerKeyMap = new Map(headers.map(h => [h.header_key, h._id.toString()]));
//     const categoryKeyMap = new Map(headers.map(h => [h.category_key, h._id.toString()]));

//     const bufferStream = new Readable();
//     bufferStream.push(req.file.buffer);
//     bufferStream.push(null);

//     const csvData = [];
//     const errors = [];
//     let processedCount = 0;

//     bufferStream
//       .pipe(csv({
//         separator: ',',
//         headers: false,
//         skipLines: 0
//       }))
//       .on('data', (row) => {
//         const rowValues = Object.values(row).map(val => val.toString().trim());
//         csvData.push(rowValues);
//       })
//       .on('end', async () => {
//         try {
//           if (csvData.length < 3) {
//             return next(new AppError('CSV must contain at least category row, header row and one data row', 400));
//           }

//           const [categoryRow, headerRow, ...dataRows] = csvData;

//           for (const row of dataRows) {
//             const modelName = row[0]?.trim();
//             if (!modelName) {
//               errors.push(`Skipping row: Missing model name`);
//               continue;
//             }

//             try {
//               let model = await Model.findOne({ model_name: modelName });
//               const isNew = !model;

//               if (isNew) {
//                 model = new Model({ 
//                   model_name: modelName,
//                   prices: [] 
//                 });
//               }

//               // Clear existing prices for this branch
//               model.prices = model.prices.filter(p => !p.branch_id.equals(branch._id));

//               // Process each price column
//               for (let i = 1; i < headerRow.length; i++) {
//                 const headerKey = headerRow[i]?.trim();
//                 const categoryKey = categoryRow[i]?.trim();
//                 const value = cleanValue(row[i]);

//                 let headerId = headerKeyMap.get(headerKey);
//                 if (!headerId && categoryKey) {
//                   headerId = categoryKeyMap.get(categoryKey);
//                 }

//                 if (headerId && value !== null) {
//                   model.prices.push({
//                     value: value,
//                     header_id: headerId,
//                     branch_id: branch._id
//                   });
//                 }
//               }

//               if (model.prices.length > 0) {
//                 await model.save();
//                 processedCount++;
//               } else {
//                 errors.push(`Skipping model ${modelName}: No valid prices found`);
//               }
//             } catch (err) {
//               errors.push(`Error processing model ${modelName}: ${err.message}`);
//             }
//           }

//           res.status(200).json({
//             status: 'success',
//             message: 'CSV import completed',
//             imported: processedCount,
//             errors: errors.length > 0 ? errors : undefined,
//             branch_id: branch._id
//           });
//         } catch (err) {
//           next(err);
//         }
//       });
//   } catch (err) {
//     logger.error(`Error importing CSV: ${err.message}`);
//     next(err);
//   }
// };

exports.exportCSVTemplate = async (req, res, next) => {
  try {
    const { type } = req.query;
    
    if (!type || !['EV', 'IC'].includes(type.toUpperCase())) {
      return next(new AppError('Type is required and must be either EV or IC', 400));
    }

    // Get headers filtered by type
    const headers = await Header.find({ type: type.toUpperCase() }).sort({ category_key: 1, priority: 1 });
    const models = await Model.find({ type: type.toUpperCase() }).populate('prices.header_id');

    // Prepare CSV content
    let csvContent = '';
    const typeRow = ['type', type.toUpperCase()];
    const categoryRow = ['model_name'];
    const headerRow = ['-'];
    
    headers.forEach(header => {
      categoryRow.push(header.category_key);
      headerRow.push(header.header_key);
    });

    csvContent += typeRow.join(',') + '\n';
    csvContent += categoryRow.join(',') + '\n';
    csvContent += headerRow.join(',') + '\n';

    models.forEach(model => {
      const row = [model.model_name];
      
      headers.forEach(header => {
        const priceData = model.prices.find(p => 
          p.header_id && p.header_id._id.equals(header._id)
        );
        const value = priceData ? priceData.value : '';
        row.push(value);
      });

      csvContent += row.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_models_prices_export.csv`);
    res.status(200).send(csvContent);
  } catch (err) {
    logger.error(`Error exporting CSV template: ${err.message}`);
    next(err);
  }
};

exports.importCSV = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('No CSV file uploaded', 400));
    }

    // Check if branch_id and type are provided
    if (!req.body.branch_id) {
      return next(new AppError('Branch ID is required', 400));
    }
    if (!req.body.type || !['EV', 'IC'].includes(req.body.type.toUpperCase())) {
      return next(new AppError('Type is required and must be either EV or IC', 400));
    }

    const type = req.body.type.toUpperCase();

    // Verify branch exists
    const branch = await Branch.findById(req.body.branch_id);
    if (!branch) {
      return next(new AppError('Branch not found', 404));
    }

    // Get all headers for the specified type
    const headers = await Header.find({ type });
    const headerKeyMap = new Map(headers.map(h => [h.header_key, h._id.toString()]));
    const categoryKeyMap = new Map(headers.map(h => [h.category_key, h._id.toString()]));

    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);

    const csvData = [];
    const errors = [];
    let processedCount = 0;

    bufferStream
      .pipe(csv({
        separator: ',',
        headers: false,
        skipLines: 0
      }))
      .on('data', (row) => {
        const rowValues = Object.values(row).map(val => val.toString().trim());
        csvData.push(rowValues);
      })
      .on('end', async () => {
        try {
          if (csvData.length < 4) {
            return next(new AppError('CSV must contain at least type row, category row, header row and one data row', 400));
          }

          const [typeRow, categoryRow, headerRow, ...dataRows] = csvData;

          // Verify type matches
          const csvType = typeRow[1]?.toUpperCase();
          if (csvType !== type) {
            return next(new AppError(`CSV type (${csvType}) doesn't match import type (${type})`, 400));
          }

          for (const row of dataRows) {
            const modelName = row[0]?.trim();
            if (!modelName) {
              errors.push(`Skipping row: Missing model name`);
              continue;
            }

            try {
              let model = await Model.findOne({ model_name: modelName });
              const isNew = !model;

              if (isNew) {
                model = new Model({ 
                  model_name: modelName,
                  type,
                  prices: [] 
                });
              }

              // Clear existing prices for this branch
              model.prices = model.prices.filter(p => !p.branch_id.equals(branch._id));

              // Process each price column
              for (let i = 1; i < headerRow.length; i++) {
                const headerKey = headerRow[i]?.trim();
                const categoryKey = categoryRow[i]?.trim();
                const value = cleanValue(row[i]);

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

              if (model.prices.length > 0) {
                await model.save();
                processedCount++;
              } else {
                errors.push(`Skipping model ${modelName}: No valid prices found`);
              }
            } catch (err) {
              errors.push(`Error processing model ${modelName}: ${err.message}`);
            }
          }

          res.status(200).json({
            status: 'success',
            message: 'CSV import completed',
            imported: processedCount,
            errors: errors.length > 0 ? errors : undefined,
            branch_id: branch._id,
            type
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