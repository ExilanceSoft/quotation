const Header = require('../models/HeaderModel');
const AppError = require('../utils/appError');
const logger = require('../config/logger');
const mongoose = require('mongoose');

exports.createHeader = async (req, res, next) => {
  try {
    const { category_key, type, header_key, priority, metadata } = req.body;

    // Check if header already exists with same type and category
    const existingHeader = await Header.findOne({ 
      type, 
      category_key, 
      priority 
    });
    
    if (existingHeader) {
      return next(new AppError(
        `Priority ${priority} already exists for type ${type} and category ${category_key}`,
        400
      ));
    }

    const newHeader = await Header.create({
      category_key,
      type,
      header_key,
      priority,
      metadata: metadata || {}
    });

    res.status(201).json({
      status: 'success',
      data: {
        header_id: newHeader._id,
        type: newHeader.type,
        category_key: newHeader.category_key,
        header_key: newHeader.header_key,
        priority: newHeader.priority
      }
    });
  } catch (err) {
    if (err.message.includes('conflicts with')) {
      return next(new AppError(err.message, 400));
    }
    logger.error(`Error creating header: ${err.message}`);
    next(err);
  }
};

exports.getHeaderById = async (req, res, next) => {
  try {
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
          type: header.type,
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
    if (err.message.includes('conflicts with')) {
      return next(new AppError(err.message, 400));
    }
    logger.error(`Error updating header: ${err.message}`);
    next(err);
  }
};

exports.updateHeaderPriorities = async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) {
      return next(new AppError('Request body must be an array of updates', 400));
    }

    const updates = req.body;

    for (const update of updates) {
      if (!update.header_key || typeof update.priority !== 'number' || !update.type) {
        return next(new AppError('Each update must contain type, header_key and priority', 400));
      }
      if (update.priority < 1) {
        return next(new AppError('Priority must be at least 1', 400));
      }
    }

    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { 
          type: update.type,
          header_key: update.header_key 
        },
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
    const Model = require('../models/ModelModel');
    const referencedModels = await Model.find({ header_id: req.params.id });
    
    if (referencedModels.length > 0) {
      return next(new AppError('Cannot delete header - it is referenced by existing models', 400));
    }

    const header = await Header.findByIdAndDelete(req.params.id);

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

exports.getHeadersByType = async (req, res, next) => {
  try {
    const { type } = req.params;
    const { category_key, grouped } = req.query;

    if (!['EV', 'IC'].includes(type.toUpperCase())) {
      return next(new AppError('Type must be either EV or IC', 400));
    }

    let query = Header.find({ type: type.toUpperCase() }).select('-__v');

    if (category_key) {
      query = query.where('category_key').equals(category_key);
    }

    if (req.query.sort === 'priority') {
      query = query.sort({ priority: 1 });
    }

    const headers = await query;

    if (grouped === 'true') {
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
    logger.error(`Error getting headers by type: ${err.message}`);
    next(err);
  }
};

exports.getAllHeaders = async (req, res, next) => {
  try {
    let query = Header.find().select('-__v');

    if (req.query.type) {
      query = query.where('type').equals(req.query.type.toUpperCase());
    }

    if (req.query.sort === 'priority') {
      query = query.sort({ priority: 1 });
    }

    const headers = await query;

    if (req.query.grouped === 'true') {
      const groupedHeaders = headers.reduce((acc, header) => {
        const groupKey = `${header.type}_${header.category_key}`;
        if (!acc[groupKey]) {
          acc[groupKey] = [];
        }
        acc[groupKey].push({
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