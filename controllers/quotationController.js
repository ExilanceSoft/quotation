const Quotation = require('../models/Quotation');
const quotationService = require('../services/quotationService');
const logger = require('../config/logger');
const { validateQuotationInput } = require('../utils/validators');
const { ErrorResponse } = require('../utils/errorHandler');

// @desc    Create new quotation
// @route   POST /api/quotations
// @access  Private
exports.createQuotation = async (req, res, next) => {
  try {
    const { errors, isValid } = validateQuotationInput(req.body);
    
    if (!isValid) {
      logger.warn('Quotation validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    const quotationData = await quotationService.generateQuotation({
      ...req.body,
      userId: req.user.id
    });

    const quotation = await Quotation.create(quotationData);
    
    logger.info(`Quotation created: ${quotation.quotation_number}`);
    res.status(201).json({
      success: true,
      data: quotation
    });
  } catch (err) {
    logger.error(`Error creating quotation: ${err.message}`);
    next(err);
  }
};

// @desc    Get all quotations
// @route   GET /api/quotations
// @access  Private
exports.getQuotations = async (req, res, next) => {
  try {
    // Only allow admins to see all quotations
    const filter = req.user.role === 'admin' ? {} : { created_by: req.user.id };
    
    const { fromDate, toDate, branchId } = req.query;
    
    if (fromDate && toDate) {
      filter.createdAt = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate)
      };
    }
    
    if (branchId) {
      filter.branch_id = branchId;
    }

    const quotations = await Quotation.find(filter)
      .populate('branch_id', 'name city')
      .populate('created_by', 'full_name')
      .sort({ createdAt: -1 });

    logger.info(`User ${req.user.id} fetched ${quotations.length} quotations`);
    res.status(200).json({
      success: true,
      count: quotations.length,
      data: quotations
    });
  } catch (err) {
    logger.error(`Error fetching quotations: ${err.message}`);
    next(err);
  }
};

// @desc    Get single quotation
// @route   GET /api/quotations/:id
// @access  Private
exports.getQuotation = async (req, res, next) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate('branch_id', 'name city phone gst_number address')
      .populate('created_by', 'full_name');

    if (!quotation) {
      logger.warn(`Quotation not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Quotation not found with id ${req.params.id}`, 404));
    }

    // Check if user is authorized to view this quotation
    if (req.user.role !== 'admin' && quotation.created_by.toString() !== req.user.id) {
      logger.warn(`User ${req.user.id} unauthorized to access quotation ${req.params.id}`);
      return next(new ErrorResponse('Not authorized to access this quotation', 401));
    }

    logger.info(`Fetched quotation: ${quotation.quotation_number}`);
    res.status(200).json({
      success: true,
      data: quotation
    });
  } catch (err) {
    logger.error(`Error fetching quotation: ${err.message}`);
    next(err);
  }
};

// @desc    Update quotation
// @route   PUT /api/quotations/:id
// @access  Private
exports.updateQuotation = async (req, res, next) => {
  try {
    const { errors, isValid } = validateQuotationInput(req.body);
    
    if (!isValid) {
      logger.warn('Quotation validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    let quotation = await Quotation.findById(req.params.id);

    if (!quotation) {
      logger.warn(`Quotation not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Quotation not found with id ${req.params.id}`, 404));
    }

    // Check if user is authorized to update this quotation
    if (req.user.role !== 'admin' && quotation.created_by.toString() !== req.user.id) {
      logger.warn(`User ${req.user.id} unauthorized to update quotation ${req.params.id}`);
      return next(new ErrorResponse('Not authorized to update this quotation', 401));
    }

    // Regenerate quotation data if model or accessories changed
    if (req.body.modelId || req.body.selectedAccessoryIds) {
      const newQuotationData = await quotationService.generateQuotation({
        ...req.body,
        userId: req.user.id,
        branchId: req.body.branchId || quotation.branch_id
      });

      quotation = await Quotation.findByIdAndUpdate(req.params.id, newQuotationData, {
        new: true,
        runValidators: true
      });
    } else {
      // Only update customer details or other non-model related fields
      quotation = await Quotation.findByIdAndUpdate(
        req.params.id, 
        { 
          customer_details: req.body.customerDetails || quotation.customer_details,
          finance_required: req.body.financeRequired ?? quotation.finance_required,
          test_ride_requested: req.body.testRideRequested ?? quotation.test_ride_requested,
          expected_delivery_date: req.body.expectedDeliveryDate || quotation.expected_delivery_date
        }, 
        {
          new: true,
          runValidators: true
        }
      );
    }

    logger.info(`Updated quotation: ${quotation.quotation_number}`);
    res.status(200).json({
      success: true,
      data: quotation
    });
  } catch (err) {
    logger.error(`Error updating quotation: ${err.message}`);
    next(err);
  }
};

// @desc    Delete quotation
// @route   DELETE /api/quotations/:id
// @access  Private/Admin
exports.deleteQuotation = async (req, res, next) => {
  try {
    const quotation = await Quotation.findByIdAndDelete(req.params.id);

    if (!quotation) {
      logger.warn(`Quotation not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Quotation not found with id ${req.params.id}`, 404));
    }

    logger.info(`Deleted quotation: ${quotation.quotation_number}`);
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    logger.error(`Error deleting quotation: ${err.message}`);
    next(err);
  }
};

// @desc    Generate quotation PDF
// @route   GET /api/quotations/:id/pdf
// @access  Private
exports.generateQuotationPDF = async (req, res, next) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate('branch_id', 'name address city state pincode phone gst_number')
      .populate('created_by', 'full_name');

    if (!quotation) {
      logger.warn(`Quotation not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Quotation not found with id ${req.params.id}`, 404));
    }

    // Check if user is authorized to view this quotation
    if (req.user.role !== 'admin' && quotation.created_by.toString() !== req.user.id) {
      logger.warn(`User ${req.user.id} unauthorized to access quotation ${req.params.id}`);
      return next(new ErrorResponse('Not authorized to access this quotation', 401));
    }

    // In a real implementation, you would use a PDF generation library like pdfkit or puppeteer
    // This is a simplified example
    const pdfData = {
      quotationNumber: quotation.quotation_number,
      date: quotation.date,
      customer: quotation.customer_details,
      selectedModel: quotation.selected_model,
      totalAmount: quotation.selected_model.pricing.total,
      branchDetails: quotation.branch_id,
      salesPerson: quotation.created_by.full_name
    };

    logger.info(`Generated PDF for quotation: ${quotation.quotation_number}`);
    res.status(200).json({
      success: true,
      data: pdfData,
      message: 'PDF generation would happen here in a real implementation'
    });
  } catch (err) {
    logger.error(`Error generating quotation PDF: ${err.message}`);
    next(err);
  }
};

// @desc    Get quotations statistics
// @route   GET /api/quotations/stats
// @access  Private/Admin
exports.getQuotationStats = async (req, res, next) => {
  try {
    const stats = await Quotation.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          totalAmount: { 
            $sum: '$selected_model.pricing.total' 
          }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          count: 1,
          totalAmount: 1
        }
      }
    ]);

    const branchStats = await Quotation.aggregate([
      {
        $group: {
          _id: '$branch_id',
          count: { $sum: 1 },
          totalAmount: { 
            $sum: '$selected_model.pricing.total' 
          }
        }
      },
      {
        $lookup: {
          from: 'branches',
          localField: '_id',
          foreignField: '_id',
          as: 'branch'
        }
      },
      {
        $unwind: '$branch'
      },
      {
        $project: {
          _id: 0,
          branchId: '$_id',
          branchName: '$branch.name',
          branchCity: '$branch.city',
          count: 1,
          totalAmount: 1
        }
      }
    ]);

    logger.info('Fetched quotation statistics');
    res.status(200).json({
      success: true,
      data: {
        monthlyStats: stats,
        branchStats: branchStats
      }
    });
  } catch (err) {
    logger.error(`Error fetching quotation statistics: ${err.message}`);
    next(err);
  }
};