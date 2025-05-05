const Header = require('../models/HeaderModel');
const AppError = require('../utils/appError');
const logger = require('../config/logger');
const mongoose = require('mongoose');

exports.createHeader = async (req, res, next) => {
  try {
    const { category_key, header_key, priority, metadata } = req.body;

    // Check if header already exists
    const existingHeader = await Header.findOne({ header_key });
    if (existingHeader) {
      return next(new AppError('Header with this key already exists', 400));
    }

    const newHeader = await Header.create({
      category_key,
      header_key,
      priority,
      metadata: metadata || {}
    });

    res.status(201).json({
      status: 'success',
      data: {
        header_id: newHeader._id,
        category_key: newHeader.category_key,
        header_key: newHeader.header_key,
        priority: newHeader.priority
      }
    });
  } catch (err) {
    logger.error(`Error creating header: ${err.message}`);
    next(err);
  }
};

// headerController.js
exports.getHeaderById = async (req, res, next) => {
    try {
      // Validate ID format first
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return next(new AppError('Invalid header ID format', 400));
      }
  
      const header = await Header.findById(req.params.id).select('-__v');
  
      if (!header) {
        return next(new AppError('No header found with that ID', 404));
      }
  
      res.status(200).json({
        status: 'success',
        data: {
          header: {
            _id: header._id,
            category_key: header.category_key,
            header_key: header.header_key,
            priority: header.priority,
            metadata: header.metadata,
            createdAt: header.createdAt
          }
        }
      });
    } catch (err) {
      logger.error(`Error getting header by ID: ${err.message}`);
      next(err);
    }
  };
exports.updateHeader = async (req, res, next) => {
    try {
      // Validate ID format first
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return next(new AppError('Invalid header ID format', 400));
      }
  
      const header = await Header.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
          new: true,
          runValidators: true
        }
      );
  
      if (!header) {
        return next(new AppError('No header found with that ID', 404));
      }
  
      res.status(200).json({
        status: 'success',
        data: {
          header
        }
      });
    } catch (err) {
      logger.error(`Error updating header: ${err.message}`);
      next(err);
    }
  };
  
  exports.updateHeaderPriorities = async (req, res, next) => {
    try {
      // Ensure the request body is an array
      if (!Array.isArray(req.body)) {
        return next(new AppError('Request body must be an array of updates', 400));
      }
  
      const updates = req.body;
  
      // Validate each update
      for (const update of updates) {
        if (!update.header_key || typeof update.priority !== 'number') {
          return next(new AppError('Each update must contain header_key and priority', 400));
        }
        if (update.priority < 1) {
          return next(new AppError('Priority must be at least 1', 400));
        }
      }
  
      const bulkOps = updates.map(update => ({
        updateOne: {
          filter: { header_key: update.header_key },
          update: { $set: { priority: update.priority } },
          upsert: false
        }
      }));
  
      const result = await Header.bulkWrite(bulkOps);
  
      res.status(200).json({
        status: 'success',
        message: 'Header priorities updated successfully',
        updated: result.modifiedCount,
        notFound: updates.length - result.matchedCount
      });
  
    } catch (err) {
      logger.error(`Error updating header priorities: ${err.message}`);
      next(err);
    }
  };
exports.deleteHeader = async (req, res, next) => {
  try {
    const header = await Header.findByIdAndDelete(req.params.headerId);

    if (!header) {
      return next(new AppError('No header found with that ID', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    logger.error(`Error deleting header: ${err.message}`);
    next(err);
  }
};

exports.getAllHeaders = async (req, res, next) => {
  try {
    let query = Header.find().select('-__v');

    if (req.query.sort === 'priority') {
      query = query.sort({ priority: 1 });
    }

    const headers = await query;

    if (req.query.grouped === 'true') {
      const groupedHeaders = headers.reduce((acc, header) => {
        if (!acc[header.category_key]) {
          acc[header.category_key] = [];
        }
        acc[header.category_key].push({
          header_key: header.header_key,
          priority: header.priority,
          header_id: header._id
        });
        return acc;
      }, {});

      return res.status(200).json({
        status: 'success',
        data: groupedHeaders
      });
    }

    res.status(200).json({
      status: 'success',
      results: headers.length,
      data: {
        headers
      }
    });
  } catch (err) {
    logger.error(`Error getting headers: ${err.message}`);
    next(err);
  }
};