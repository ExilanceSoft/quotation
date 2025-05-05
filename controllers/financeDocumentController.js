const FinanceDocument = require('../models/FinanceDocument');
const logger = require('../config/logger');
const { ErrorResponse } = require('../utils/errorHandler');
const mongoose = require('mongoose');

// @desc    Get all finance documents
// @route   GET /api/finance-documents
// @access  Private
exports.getFinanceDocuments = async (req, res, next) => {
  try {
    const documents = await FinanceDocument.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: documents.length,
      data: documents
    });
  } catch (err) {
    logger.error(`Error getting finance documents: ${err.message}`);
    next(err);
  }
};

// @desc    Get single finance document
// @route   GET /api/finance-documents/:id
// @access  Private
exports.getFinanceDocument = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(new ErrorResponse(`Invalid document ID format`, 400));
    }

    const document = await FinanceDocument.findById(req.params.id);
    
    if (!document) {
      logger.warn(`Finance document not found with id of ${req.params.id}`);
      return next(new ErrorResponse(`Finance document not found with id of ${req.params.id}`, 404));
    }
    
    res.status(200).json({
      success: true,
      data: document
    });
  } catch (err) {
    logger.error(`Error getting finance document: ${err.message}`);
    next(err);
  }
};

// @desc    Create new finance document
// @route   POST /api/finance-documents
// @access  Private
exports.createFinanceDocument = async (req, res, next) => {
  try {
    const document = await FinanceDocument.create(req.body);
    
    logger.info(`Finance document created: ${document.name}`);
    res.status(201).json({
      success: true,
      data: document
    });
  } catch (err) {
    logger.error(`Error creating finance document: ${err.message}`);
    next(err);
  }
};

// @desc    Update finance document
// @route   PUT /api/finance-documents/:id
// @access  Private
exports.updateFinanceDocument = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(new ErrorResponse(`Invalid document ID format`, 400));
    }

    let document = await FinanceDocument.findById(req.params.id);
    
    if (!document) {
      logger.warn(`Finance document not found with id of ${req.params.id}`);
      return next(new ErrorResponse(`Finance document not found with id of ${req.params.id}`, 404));
    }
    
    document = await FinanceDocument.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    logger.info(`Finance document updated: ${document.name}`);
    res.status(200).json({
      success: true,
      data: document
    });
  } catch (err) {
    logger.error(`Error updating finance document: ${err.message}`);
    next(err);
  }
};

// @desc    Delete finance document
// @route   DELETE /api/finance-documents/:id
// @access  Private
exports.deleteFinanceDocument = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(new ErrorResponse(`Invalid document ID format`, 400));
    }

    const document = await FinanceDocument.findById(req.params.id);
    
    if (!document) {
      logger.warn(`Finance document not found with id of ${req.params.id}`);
      return next(new ErrorResponse(`Finance document not found with id of ${req.params.id}`, 404));
    }
    
    // Use deleteOne() instead of remove()
    await FinanceDocument.deleteOne({ _id: req.params.id });
    
    logger.info(`Finance document deleted: ${document.name}`);
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    logger.error(`Error deleting finance document: ${err.message}`);
    next(err);
  }
};