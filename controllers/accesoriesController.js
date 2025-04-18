const Accessory = require('../models/accessory');
const logger = require('../config/logger');
const { validateAccessoryInput } = require('../utils/validators');
const { ErrorResponse } = require('../utils/errorHandler');

// @desc    Get all accessories
// @route   GET /api/accessories
// @access  Public
exports.getAccessories = async (req, res, next) => {
  try {
    const { activeOnly = 'true', category, sort = 'name' } = req.query;
    const filter = {};
    
    if (activeOnly === 'true') filter.is_active = true;
    if (category) filter.category = category;

    const accessories = await Accessory.find(filter)
      .sort(sort)
      .collation({ locale: 'en', strength: 2 }); // Case-insensitive sorting

    logger.info(`Fetched ${accessories.length} accessories`);
    res.status(200).json({
      success: true,
      count: accessories.length,
      data: accessories
    });
  } catch (err) {
    logger.error(`Error fetching accessories: ${err.message}`);
    next(err);
  }
};

// @desc    Get single accessory
// @route   GET /api/accessories/:id
// @access  Public
exports.getAccessory = async (req, res, next) => {
  try {
    const accessory = await Accessory.findById(req.params.id);

    if (!accessory) {
      logger.warn(`Accessory not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Accessory not found with id ${req.params.id}`, 404));
    }

    logger.info(`Fetched accessory: ${accessory.name}`);
    res.status(200).json({
      success: true,
      data: accessory
    });
  } catch (err) {
    logger.error(`Error fetching accessory: ${err.message}`);
    next(err);
  }
};

// @desc    Create new accessory
// @route   POST /api/accessories
// @access  Private/Admin
exports.createAccessory = async (req, res, next) => {
  try {
    const { errors, isValid } = validateAccessoryInput(req.body);
    
    if (!isValid) {
      logger.warn('Accessory validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    const accessory = await Accessory.create(req.body);
    
    logger.info(`Accessory created: ${accessory.name}`);
    res.status(201).json({
      success: true,
      data: accessory
    });
  } catch (err) {
    logger.error(`Error creating accessory: ${err.message}`);
    next(err);
  }
};

// @desc    Update accessory
// @route   PUT /api/accessories/:id
// @access  Private/Admin
exports.updateAccessory = async (req, res, next) => {
  try {
    const { errors, isValid } = validateAccessoryInput(req.body);
    
    if (!isValid) {
      logger.warn('Accessory validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    const accessory = await Accessory.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!accessory) {
      logger.warn(`Accessory not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Accessory not found with id ${req.params.id}`, 404));
    }

    logger.info(`Updated accessory: ${accessory.name}`);
    res.status(200).json({
      success: true,
      data: accessory
    });
  } catch (err) {
    logger.error(`Error updating accessory: ${err.message}`);
    next(err);
  }
};

// @desc    Delete accessory
// @route   DELETE /api/accessories/:id
// @access  Private/Admin
exports.deleteAccessory = async (req, res, next) => {
  try {
    const accessory = await Accessory.findByIdAndDelete(req.params.id);

    if (!accessory) {
      logger.warn(`Accessory not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Accessory not found with id ${req.params.id}`, 404));
    }

    logger.info(`Deleted accessory: ${accessory.name}`);
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    logger.error(`Error deleting accessory: ${err.message}`);
    next(err);
  }
};

// @desc    Toggle accessory active status
// @route   PATCH /api/accessories/:id/toggle-active
// @access  Private/Admin
exports.toggleActive = async (req, res, next) => {
  try {
    const accessory = await Accessory.findById(req.params.id);

    if (!accessory) {
      logger.warn(`Accessory not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Accessory not found with id ${req.params.id}`, 404));
    }

    accessory.is_active = !accessory.is_active;
    await accessory.save();

    logger.info(`Toggled active status for accessory: ${accessory.name} to ${accessory.is_active}`);
    res.status(200).json({
      success: true,
      data: accessory
    });
  } catch (err) {
    logger.error(`Error toggling accessory active status: ${err.message}`);
    next(err);
  }
};