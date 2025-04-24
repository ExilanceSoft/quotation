const Model = require('../models/Model');
const Branch = require('../models/Branch');
const logger = require('../config/logger');
const { validateModelInput } = require('../utils/validators');
const { ErrorResponse } = require('../utils/errorHandler');
const { generateModelCode } = require('../services/numberGenerator');

// Helper function to check branch access
const checkBranchAccess = async (user, branchId) => {
  if (user.role_id.name === 'super_admin') return true;
  if (!user.branch_id) return false;
  return user.branch_id.toString() === branchId.toString();
};

// @desc    Get all models
// @route   GET /api/models
// @access  Public (but filtered by branch for non-super admins)
exports.getModels = async (req, res, next) => {
  try {
    const { activeOnly = 'true', modelGroup, fuelType, sort = 'name', branchId } = req.query;
    const filter = {};
    
    if (activeOnly === 'true') filter.is_active = true;
    if (modelGroup) filter.model_group = new RegExp(modelGroup, 'i');
    if (fuelType) filter.fuel_type = fuelType;

    // For non-super admin users, filter by their branch
    if (req.user && req.user.role_id.name !== 'super_admin') {
      if (!req.user.branch_id) {
        return next(new ErrorResponse('User is not assigned to any branch', 403));
      }
      filter.branch_id = req.user.branch_id;
    } else if (branchId) {
      // Super admin can filter by branch if specified
      filter.branch_id = branchId;
    }

    const models = await Model.find(filter)
      .sort(sort)
      .collation({ locale: 'en', strength: 2 })
      .populate('branch_id', 'name city');

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
    const model = await Model.findById(req.params.id).populate('branch_id', 'name city');

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
// @access  Private (admin/super_admin)
exports.createModel = async (req, res, next) => {
  try {
    const { errors, isValid } = validateModelInput(req.body);
    
    if (!isValid) {
      logger.warn('Model validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    // For non-super admin users, use their branch
    if (!req.user.branch_id && req.user.role_id.name !== 'super_admin') {
      return next(new ErrorResponse('User must be assigned to a branch to create models', 403));
    }

    const modelData = {
      ...req.body,
      branch_id: req.user.branch_id, // Auto-set from user
      model_code: generateModelCode(req.body.name)
    };

    // Handle image upload if present
    if (req.file) {
      modelData.images = [{
        url: `/uploads/models/${req.file.filename}`,
        caption: req.body.imageCaption || '',
        is_primary: true
      }];
    }

    const model = await Model.create(modelData);
    
    logger.info(`Model created: ${model.name} by ${req.user.id}`);
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
// @access  Private (admin/super_admin)
exports.updateModel = async (req, res, next) => {
  try {
    const { errors, isValid } = validateModelInput(req.body);
    
    if (!isValid) {
      logger.warn('Model validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    const model = await Model.findById(req.params.id);
    if (!model) {
      logger.warn(`Model not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Model not found with id ${req.params.id}`, 404));
    }

    // Check branch access
    const hasAccess = await checkBranchAccess(req.user, model.branch_id);
    if (!hasAccess) {
      return next(new ErrorResponse('Not authorized to update this model', 403));
    }

    // Prevent changing branch if not super admin
    if (req.body.branch_id && req.user.role_id.name !== 'super_admin') {
      if (req.body.branch_id.toString() !== model.branch_id.toString()) {
        return next(new ErrorResponse('Not authorized to change model branch', 403));
      }
    }

    const modelData = { ...req.body };

    // Handle image upload if present
    if (req.file) {
      modelData.images = [
        ...(model.images || []),
        {
          url: `/uploads/models/${req.file.filename}`,
          caption: req.body.imageCaption || '',
          is_primary: req.body.is_primary || false
        }
      ];
    }
    const updatedModel = await Model.findByIdAndUpdate(req.params.id, modelData, {
      new: true,
      runValidators: true
    });
    logger.info(`Updated model: ${updatedModel.name} by ${req.user.id}`);
    res.status(200).json({
      success: true,
      data: updatedModel
    });
  } catch (err) {
    logger.error(`Error updating model: ${err.message}`);
    next(err);
  }
};

// @desc    Delete model
// @route   DELETE /api/models/:id
// @access  Private (admin/super_admin)
exports.deleteModel = async (req, res, next) => {
  try {
    const model = await Model.findById(req.params.id);
    if (!model) {
      logger.warn(`Model not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Model not found with id ${req.params.id}`, 404));
    }

    // Check branch access
    const hasAccess = await checkBranchAccess(req.user, model.branch_id);
    if (!hasAccess) {
      return next(new ErrorResponse('Not authorized to delete this model', 403));
    }

    await Model.findByIdAndDelete(req.params.id);

    logger.info(`Deleted model: ${model.name} by ${req.user.id}`);
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    logger.error(`Error deleting model: ${err.message}`);
    next(err);
  }
};

// @desc    Upload model image
// @route   POST /api/models/:id/image
// @access  Private (admin/super_admin)
exports.uploadModelImage = async (req, res, next) => {
  try {
    const model = await Model.findById(req.params.id);
    if (!model) {
      return next(new ErrorResponse(`Model not found with id ${req.params.id}`, 404));
    }

    // Check branch access
    const hasAccess = await checkBranchAccess(req.user, model.branch_id);
    if (!hasAccess) {
      return next(new ErrorResponse('Not authorized to update this model', 403));
    }

    if (!req.file) {
      return next(new ErrorResponse('Please upload an image file', 400));
    }

    const imageUrl = `/uploads/models/${req.file.filename}`;

    model.images.push({
      url: imageUrl,
      caption: req.body.caption || '',
      is_primary: req.body.is_primary || false
    });

    await model.save();

    res.status(200).json({
      success: true,
      data: model
    });
  } catch (err) {
    logger.error(`Error uploading model image: ${err.message}`);
    next(err);
  }
};

// @desc    Get models by group
// @route   GET /api/models/group/:group
// @access  Public
exports.getModelsByGroup = async (req, res, next) => {
  try {
    const filter = { 
      model_group: new RegExp(req.params.group, 'i'),
      is_active: true
    };

    // For non-super admin users, filter by their branch
    if (req.user && req.user.role_id.name !== 'super_admin' && req.user.branch_id) {
      filter.branch_id = req.user.branch_id;
    }

    const models = await Model.find(filter).sort('ex_showroom_price');

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