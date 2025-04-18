const Model = require('../models/Model');
const logger = require('../config/logger');
const { validateModelInput } = require('../utils/validators');
const { ErrorResponse } = require('../utils/errorHandler');
const { generateModelCode } = require('../services/numberGenerator');

// @desc    Get all models
// @route   GET /api/models
// @access  Public
exports.getModels = async (req, res, next) => {
  try {
    const { activeOnly = 'true', modelGroup, fuelType, sort = 'name' } = req.query;
    const filter = {};
    
    if (activeOnly === 'true') filter.is_active = true;
    if (modelGroup) filter.model_group = new RegExp(modelGroup, 'i');
    if (fuelType) filter.fuel_type = fuelType;

    const models = await Model.find(filter)
      .sort(sort)
      .collation({ locale: 'en', strength: 2 });

    logger.info(`Fetched ${models.length} models`);
    res.status(200).json({
      success: true,
      count: models.length,
      data: models
    });
  } catch (err) {
    logger.error(`Error fetching models: ${err.message}`);
    next(err);
  }
};

// @desc    Get single model
// @route   GET /api/models/:id
// @access  Public
exports.getModel = async (req, res, next) => {
  try {
    const model = await Model.findById(req.params.id);

    if (!model) {
      logger.warn(`Model not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Model not found with id ${req.params.id}`, 404));
    }

    logger.info(`Fetched model: ${model.name}`);
    res.status(200).json({
      success: true,
      data: model
    });
  } catch (err) {
    logger.error(`Error fetching model: ${err.message}`);
    next(err);
  }
};

// @desc    Create new model
// @route   POST /api/models
// @access  Private/Admin
exports.createModel = async (req, res, next) => {
  try {
    const { errors, isValid } = validateModelInput(req.body);
    
    if (!isValid) {
      logger.warn('Model validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    const modelData = {
      ...req.body,
      model_code: generateModelCode(req.body.name)
    };

    const model = await Model.create(modelData);
    
    logger.info(`Model created: ${model.name}`);
    res.status(201).json({
      success: true,
      data: model
    });
  } catch (err) {
    logger.error(`Error creating model: ${err.message}`);
    next(err);
  }
};

// @desc    Update model
// @route   PUT /api/models/:id
// @access  Private/Admin
exports.updateModel = async (req, res, next) => {
  try {
    const { errors, isValid } = validateModelInput(req.body);
    
    if (!isValid) {
      logger.warn('Model validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    const model = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!model) {
      logger.warn(`Model not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Model not found with id ${req.params.id}`, 404));
    }

    logger.info(`Updated model: ${model.name}`);
    res.status(200).json({
      success: true,
      data: model
    });
  } catch (err) {
    logger.error(`Error updating model: ${err.message}`);
    next(err);
  }
};

// @desc    Delete model
// @route   DELETE /api/models/:id
// @access  Private/Admin
exports.deleteModel = async (req, res, next) => {
  try {
    const model = await Model.findByIdAndDelete(req.params.id);

    if (!model) {
      logger.warn(`Model not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Model not found with id ${req.params.id}`, 404));
    }

    logger.info(`Deleted model: ${model.name}`);
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    logger.error(`Error deleting model: ${err.message}`);
    next(err);
  }
};

// @desc    Toggle model active status
// @route   PATCH /api/models/:id/toggle-active
// @access  Private/Admin
exports.toggleActive = async (req, res, next) => {
  try {
    const model = await Model.findById(req.params.id);

    if (!model) {
      logger.warn(`Model not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Model not found with id ${req.params.id}`, 404));
    }

    model.is_active = !model.is_active;
    await model.save();

    logger.info(`Toggled active status for model: ${model.name} to ${model.is_active}`);
    res.status(200).json({
      success: true,
      data: model
    });
  } catch (err) {
    logger.error(`Error toggling model active status: ${err.message}`);
    next(err);
  }
};

// @desc    Get models by group
// @route   GET /api/models/group/:group
// @access  Public
exports.getModelsByGroup = async (req, res, next) => {
  try {
    const models = await Model.find({ 
      model_group: new RegExp(req.params.group, 'i'),
      is_active: true
    }).sort('ex_showroom_price');

    if (!models || models.length === 0) {
      logger.warn(`No models found for group: ${req.params.group}`);
      return next(new ErrorResponse(`No models found for group ${req.params.group}`, 404));
    }

    logger.info(`Fetched ${models.length} models for group: ${req.params.group}`);
    res.status(200).json({
      success: true,
      count: models.length,
      data: models
    });
  } catch (err) {
    logger.error(`Error fetching models by group: ${err.message}`);
    next(err);
  }
};