const Model = require('../models/ModelModel');
const Header = require('../models/HeaderModel');
const AppError = require('../utils/appError');
const logger = require('../config/logger');
const mongoose = require('mongoose');
// modelController.js
exports.createModel = async (req, res, next) => {
  try {
    const { model_name, type, prices = [] } = req.body;

    // Validate model name and type
    if (!model_name || typeof model_name !== 'string') {
      return next(new AppError('Model name is required and must be a string', 400));
    }
    if (!type || !['EV', 'ICE'].includes(type.toUpperCase())) {
      return next(new AppError('Type is required and must be either EV or IC', 400));
    }

    // Check if model already exists
    const existingModel = await Model.findOne({ model_name });
    if (existingModel) {
      return next(new AppError('Model with this name already exists', 400));
    }

    const newModel = await Model.create({
      model_name,
      type: type.toUpperCase(),
      prices
    });

    res.status(201).json({
      status: 'success',
      data: {
        model: {
          _id: newModel._id,
          model_name: newModel.model_name,
          type: newModel.type,
          prices: newModel.prices,
          createdAt: newModel.createdAt
        }
      }
    });
  } catch (err) {
    logger.error(`Error creating model: ${err.message}`);
    next(err);
  }
};
  exports.getModelById = async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.modelId)) {
        return next(new AppError('Invalid model ID format', 400));
      }
  
      const model = await Model.findById(req.params.modelId)
        .populate({
          path: 'prices.header_id prices.branch_id',
          select: 'header_key category_key priority metadata name city'
        });
  
      if (!model) {
        return next(new AppError('No model found with that ID', 404));
      }
      // Transform the data for better client-side consumption
      const transformedData = {
        _id: model._id,
        model_name: model.model_name,
        prices: model.prices.map(price => ({
          value: price.value,
          header_id: price.header_id?._id || null,
          header_key: price.header_id?.header_key || null,
          category_key: price.header_id?.category_key || null,
          priority: price.header_id?.priority || null,
          metadata: price.header_id?.metadata || {},
          branch_id: price.branch_id?._id || null,
          branch_name: price.branch_id?.name || null,
          branch_city: price.branch_id?.city || null
        })),
        createdAt: model.createdAt
      };
      res.status(200).json({
        status: 'success',
        data: {
          model: transformedData
        }
      });
    } catch (err) {
      logger.error(`Error getting model by ID: ${err.message}`);
      next(err);
    }
  };
exports.getModelPrices = async (req, res, next) => {
  try {
    const model = await Model.findById(req.params.modelId)
      .populate('prices.header_id', 'header_key category_key priority metadata');

    if (!model) {
      return next(new AppError('No model found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        model
      }
    });
  } catch (err) {
    logger.error(`Error getting model prices: ${err.message}`);
    next(err);
  }
};
const validateObjectIds = (ids) => {
  return ids.every(id => mongoose.Types.ObjectId.isValid(id));
};
exports.updateModelPrices = async (req, res, next) => {
  try {
    const { prices } = req.body;

    if (!Array.isArray(prices)) {
      return next(new AppError('Prices must be provided as an array', 400));
    }

    // First get the current model
    const model = await Model.findById(req.params.modelId);
    if (!model) {
      return next(new AppError('No model found with that ID', 404));
    }

    // Create a composite key for existing prices (header_id + branch_id)
    const existingPricesMap = new Map();
    model.prices.forEach(price => {
      const key = `${price.header_id.toString()}_${price.branch_id?.toString() || 'no-branch'}`;
      existingPricesMap.set(key, price);
    });

    // Update or add new prices
    const updatedPrices = prices.map(newPrice => {
      const branchId = newPrice.branch_id || null;
      const key = `${newPrice.header_id}_${branchId || 'no-branch'}`;
      const existingPrice = existingPricesMap.get(key);
      
      if (existingPrice) {
        // Update existing price while preserving all fields
        return {
          ...existingPrice.toObject(), // keep all existing fields
          value: newPrice.value        // update only the value
        };
      }
      // Add new price if combination doesn't exist
      return {
        value: newPrice.value,
        header_id: newPrice.header_id,
        branch_id: branchId
        // Add other fields as needed
      };
    });

    // Keep prices that weren't included in the update
    model.prices.forEach(price => {
      const branchId = price.branch_id || null;
      const key = `${price.header_id.toString()}_${branchId || 'no-branch'}`;
      
      if (!prices.some(p => 
        p.header_id.toString() === price.header_id.toString() && 
        (p.branch_id?.toString() || null) === branchId?.toString()
      )) {
        updatedPrices.push(price);
      }
    });

    // Update the model with merged prices
    const updatedModel = await Model.findByIdAndUpdate(
      req.params.modelId,
      { prices: updatedPrices },
      { 
        new: true,
        runValidators: true
      }
    ).populate('prices.header_id prices.branch_id');

    res.status(200).json({
      status: 'success',
      data: {
        model: updatedModel
      }
    });
  } catch (err) {
    logger.error(`Error updating model prices: ${err.message}`);
    next(err);
  }
};

exports.updateModel = async (req, res, next) => {
  try {
    const model = await Model.findByIdAndUpdate(
      req.params.modelId,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!model) {
      return next(new AppError('No model found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        model
      }
    });
  } catch (err) {
    logger.error(`Error updating model: ${err.message}`);
    next(err);
  }
};

exports.deleteModel = async (req, res, next) => {
  try {
    const model = await Model.findByIdAndDelete(req.params.modelId);

    if (!model) {
      return next(new AppError('No model found with that ID', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    logger.error(`Error deleting model: ${err.message}`);
    next(err);
  }
};
//get active models
exports.getAllModels = async (req, res, next) => {

  try {
    // Build the base query
    let query = Model.find();
    // For non-super admin users, filter by their branch

    if (req.user && req.user.role_id.name !== 'super_admin' && req.user.branch_id) {

      query = query.where('prices.branch_id').equals(req.user.branch_id);

    }



    // Execute the query with population

    const models = await query

      .populate({

        path: 'prices.header_id prices.branch_id',

        select: 'header_key category_key priority metadata name city'

      });



    // Transform the data to match your desired format

    const transformedModels = models.map(model => ({

      model_name: model.model_name,

      prices: model.prices.map(price => ({

        value: price.value,

        header_id: price.header_id?._id || null,

        branch_id: price.branch_id?._id || null

      })),

      createdAt: model.createdAt,

      __v: model.__v,

      type: model.type,

      id: model._id

    }));



    res.status(200).json({

      status: 'success',

      results: transformedModels.length,

      data: {

        models: transformedModels

      }

    });

  } catch (err) {

    logger.error(`Error getting models: ${err.message}`);

    next(err);

  }

};

//get all model with any status 
exports.getAllModelsStatus = async (req, res, next) => {
  try {
    // Build the base query without status filter
    let query = Model.find();

    // For non-super admin users, filter by their branch
    if (req.user && req.user.role_id?.name !== 'super_admin' && req.user.branch_id) {
      if (!mongoose.Types.ObjectId.isValid(req.user.branch_id)) {
        return next(new AppError('Invalid branch ID in user profile', 400));
      }

      query = query.where('prices.branch_id').equals(req.user.branch_id);
    }

    // Execute the query with population
    const models = await query
      .populate({
        path: 'prices.header_id prices.branch_id',
        select: 'header_key category_key priority metadata name city'
      })
      .lean(); // Use lean() for better performance since we're transforming the data

    // Transform the data to match your desired format
    const transformedModels = models.map(model => ({
      _id: model._id,
      model_name: model.model_name,
      type: model.type,
      status: model.status, // Include status in response (active/inactive)
      prices: model.prices.map(price => ({
        value: price.value,
        header_id: price.header_id?._id || null,
        header_key: price.header_id?.header_key || null,
        category_key: price.header_id?.category_key || null,
        branch_id: price.branch_id?._id || null,
        branch_name: price.branch_id?.name || null,
        branch_city: price.branch_id?.city || null
      })),
      createdAt: model.createdAt
    }));

    res.status(200).json({
      status: 'success',
      results: transformedModels.length,
      data: {
        models: transformedModels
      }
    });
  } catch (err) {
    logger.error(`Error getting all models: ${err.message}`, { error: err });
    next(new AppError('Failed to retrieve models', 500));
  }
};
// Update getAllModelsWithPrices
exports.getAllModelsWithPrices = async (req, res, next) => {
  try {
    let query = Model.find();
    
    // Filter by branch_id if provided
    if (req.query.branch_id) {
      query = query.where('prices.branch_id').equals(req.query.branch_id);
    }

    // Filter by status if provided
    if (req.query.status && ['active', 'inactive'].includes(req.query.status.toLowerCase())) {
      query = query.where('status').equals(req.query.status.toLowerCase());
    }

    // Populate both header and branch information
    const models = await query.populate({
      path: 'prices.header_id prices.branch_id',
      select: 'header_key category_key priority metadata name city'
    }).lean(); // Using lean() for better performance

    // Transform the data for cleaner response
    const transformedModels = models.map(model => {
      // Filter prices if branch_id was specified
      const filteredPrices = req.query.branch_id 
        ? model.prices.filter(price => 
            (price.branch_id && price.branch_id._id.toString() === req.query.branch_id) ||
            (price.branch_id === null && req.query.branch_id === 'null')
          )
        : model.prices;

      return {
        _id: model._id,
        model_name: model.model_name,
        type: model.type,
        status: model.status || 'active', // Ensure status is always returned
        prices: filteredPrices.map(price => ({
          value: price.value,
          header_id: price.header_id?._id || null,
          header_key: price.header_id?.header_key || null,
          category_key: price.header_id?.category_key || null,
          priority: price.header_id?.priority || null,
          metadata: price.header_id?.metadata || {},
          branch_id: price.branch_id?._id || null,
          branch_name: price.branch_id?.name || null,
          branch_city: price.branch_id?.city || null
        })),
        createdAt: model.createdAt
      };
    });

    res.status(200).json({
      status: 'success',
      results: transformedModels.length,
      data: {
        models: transformedModels
      }
    });
  } catch (err) {
    logger.error(`Error getting all models with prices: ${err.message}`, {
      stack: err.stack,
      request: req.query
    });
    next(new AppError('Failed to retrieve models. Please try again later.', 500));
  }
};
// Update getModelWithPrices for specific model
exports.getModelWithPrices = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.modelId)) {
      return next(new AppError('Invalid model ID format', 400));
    }

    // Validate branch_id if provided
    if (req.query.branch_id && !mongoose.Types.ObjectId.isValid(req.query.branch_id) && req.query.branch_id !== 'null') {
      return next(new AppError('Invalid branch ID format', 400));
    }

    const model = await Model.findById(req.params.modelId)
      .populate({
        path: 'prices.header_id prices.branch_id',
        select: 'header_key category_key priority metadata name city'
      });

    if (!model) {
      return next(new AppError('No model found with that ID', 404));
    }

    // Filter prices based on branch_id (single branch only)
    const filteredPrices = req.query.branch_id 
      ? model.prices.filter(price => {
          const priceBranchId = price.branch_id?._id?.toString();
          return (
            // Match exact branch_id OR include null prices if branch_id='null'
            (priceBranchId === req.query.branch_id) ||
            (req.query.branch_id === 'null' && !priceBranchId)
          );
        })
      : model.prices; // Return all if no branch_id specified

    const transformedData = {
      _id: model._id,
      model_name: model.model_name,
      prices: filteredPrices.map(price => ({
        value: price.value,
        header_id: price.header_id?._id || null,
        header_key: price.header_id?.header_key || null,
        category_key: price.header_id?.category_key || null,
        priority: price.header_id?.priority || null,
        metadata: price.header_id?.metadata || {},
        branch_id: price.branch_id?._id || null,
        branch_name: price.branch_id?.name || null,
        branch_city: price.branch_id?.city || null
      })),
      createdAt: model.createdAt
    };

    res.status(200).json({
      status: 'success',
      data: {
        model: transformedData
      }
    });
  } catch (err) {
    logger.error(`Error getting model with prices: ${err.message}`);
    next(err);
  }
};

exports.getModelDetails = async (req, res, next) => {
  try {
    const model = await Model.findById(req.params.modelId);

    if (!model) {
      return next(new AppError('No model found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        model
      }
    });
  } catch (err) {
    logger.error(`Error getting model details: ${err.message}`);
    next(err);
  }
};

exports.cleanupModels = async (req, res, next) => {
    try {
      // Delete models with empty prices array
      const result = await Model.deleteMany({
        $or: [
          { prices: { $size: 0 } },
          { model_name: { $regex: /model_name/i } },
          { model_name: { $regex: /,/ } }
        ]
      });
      
      res.status(200).json({
        status: 'success',
        message: `Cleaned up ${result.deletedCount} malformed models`
      });
    } catch (err) {
      logger.error(`Error cleaning up models: ${err.message}`);
      next(err);
    }
  };

  // Add to existing modelController.js
exports.identifyBaseModels = async (req, res, next) => {
  try {
    // First get all headers to find the Ex-Showroom header
    const headers = await Header.find();
    const exShowroomHeader = headers.find(h => 
      h.header_key.toLowerCase().includes('ex-showroom') || 
      h.category_key.toLowerCase().includes('ex-showroom')
    );

    if (!exShowroomHeader) {
      return next(new AppError('Ex-Showroom price header not found', 404));
    }

    // Get all models with their prices
    const models = await Model.find()
      .populate('prices.header_id', 'header_key category_key');

    // Group models by series
    const seriesMap = new Map();

    models.forEach(model => {
      // Extract series name (first part of model name)
      const seriesMatch = model.model_name.match(/^([A-Za-z0-9]+)/);
      if (!seriesMatch) return;

      const seriesName = seriesMatch[1];
      if (!seriesMap.has(seriesName)) {
        seriesMap.set(seriesName, []);
      }

      // Find the Ex-Showroom price for this model
      const exShowroomPrice = model.prices.find(p => 
        p.header_id._id.equals(exShowroomHeader._id)
      );

      if (exShowroomPrice) {
        seriesMap.get(seriesName).push({
          model_id: model._id,
          model_name: model.model_name,
          price: exShowroomPrice.value
        });
      }
    });

    // Identify base model for each series (lowest price)
    const baseModels = [];
    for (const [series, models] of seriesMap) {
      if (models.length === 0) continue;

      // Sort by price ascending
      models.sort((a, b) => a.price - b.price);
      const baseModel = models[0];

      baseModels.push({
        series,
        base_model_id: baseModel.model_id,
        base_model_name: baseModel.model_name,
        base_price: baseModel.price,
        other_models: models.slice(1).map(m => ({
          model_id: m.model_id,
          model_name: m.model_name,
          price: m.price
        }))
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        baseModels
      }
    });
  } catch (err) {
    logger.error(`Error identifying base models: ${err.message}`);
    next(err);
  }
};

exports.getBaseModelForSelectedModels = async (req, res, next) => {
  try {
    const { modelIds } = req.body;
    
    if (!modelIds || !Array.isArray(modelIds)) {
      return next(new AppError('Please provide an array of model IDs', 400));
    }

    // First get all headers to find the Ex-Showroom header
    const headers = await Header.find();
    const exShowroomHeader = headers.find(h => 
      h.header_key.toLowerCase().includes('ex-showroom') || 
      h.category_key.toLowerCase().includes('ex-showroom')
    );

    if (!exShowroomHeader) {
      return next(new AppError('Ex-Showroom price header not found', 404));
    }

    // Get the selected models
    const selectedModels = await Model.find({
      _id: { $in: modelIds }
    }).populate('prices.header_id', 'header_key category_key');

    if (selectedModels.length !== modelIds.length) {
      return next(new AppError('One or more model IDs are invalid', 400));
    }

    // Group models by series
    const seriesMap = new Map();
    selectedModels.forEach(model => {
      const seriesMatch = model.model_name.match(/^([A-Za-z0-9]+)/);
      if (!seriesMatch) return;

      const seriesName = seriesMatch[1];
      if (!seriesMap.has(seriesName)) {
        seriesMap.set(seriesName, []);
      }

      const exShowroomPrice = model.prices.find(p => 
        p.header_id._id.equals(exShowroomHeader._id)
      );

      if (exShowroomPrice) {
        seriesMap.get(seriesName).push({
          model_id: model._id,
          model_name: model.model_name,
          price: exShowroomPrice.value
        });
      }
    });

    // If all selected models are from the same series, find the base model
    if (seriesMap.size === 1) {
      const [series, models] = seriesMap.entries().next().value;
      models.sort((a, b) => a.price - b.price);
      const baseModel = models[0];

      return res.status(200).json({
        status: 'success',
        data: {
          base_model_id: baseModel.model_id,
          base_model_name: baseModel.model_name,
          base_price: baseModel.price,
          series,
          is_single_series: true
        }
      });
    }

    // If models from different series, return null (no base model)
    res.status(200).json({
      status: 'success',
      data: {
        base_model_id: null,
        base_model_name: null,
        base_price: null,
        is_single_series: false,
        message: 'Selected models are from different series'
      }
    });
  } catch (err) {
    logger.error(`Error getting base model for selected models: ${err.message}`);
    next(err);
  }
};

exports.updateModelStatus = async (req, res, next) => {
  try {
    const { modelId } = req.params;
    const { status } = req.body;

    // Validate input
    if (!status || !['active', 'inactive'].includes(status.toLowerCase())) {
      return next(new AppError('Status is required and must be either "active" or "inactive"', 400));
    }

    if (!mongoose.Types.ObjectId.isValid(modelId)) {
      return next(new AppError('Invalid model ID format', 400));
    }

    // Update the model status
    const updatedModel = await Model.findByIdAndUpdate(
      modelId,
      { status: status.toLowerCase() },
      { 
        new: true,
        runValidators: true,
        select: '_id model_name status' // Only return these fields
      }
    );

    if (!updatedModel) {
      return next(new AppError('No model found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        model: updatedModel
      }
    });
  } catch (err) {
    logger.error(`Error updating model status: ${err.message}`);
    next(err);
  }
};