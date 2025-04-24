const Role = require('../models/Role');
const User = require('../models/User');
const logger = require('../config/logger');
const { ErrorResponse } = require('../utils/errorHandler');

// @desc    Create role
// @route   POST /api/roles
// @access  Private (super_admin)
exports.createRole = async (req, res, next) => {
  try {
    const { name, description, permissions, is_default } = req.body;

    // Validate permissions
    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return next(new ErrorResponse('At least one permission is required', 400));
    }

    // Check if role already exists
    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      return next(new ErrorResponse(`Role with name '${name}' already exists`, 400));
    }

    const role = await Role.create({
      name,
      description,
      permissions,
      is_default: is_default || false,
      created_by: req.user.id
    });

    logger.info(`Role created: ${role.name} by ${req.user.id}`);
    res.status(201).json({
      success: true,
      data: role
    });
  } catch (err) {
    logger.error(`Error creating role: ${err.message}`);
    next(err);
  }
};

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private (admin+)
exports.getRoles = async (req, res, next) => {
  try {
    const roles = await Role.find()
      .populate('created_by', 'username')
      .sort('name');

    logger.info(`Fetched ${roles.length} roles by ${req.user.id}`);
    res.status(200).json({
      success: true,
      count: roles.length,
      data: roles
    });
  } catch (err) {
    logger.error(`Error fetching roles: ${err.message}`);
    next(err);
  }
};

// @desc    Get single role
// @route   GET /api/roles/:id
// @access  Private (admin+)
exports.getRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id)
      .populate('created_by', 'username');

    if (!role) {
      logger.warn(`Role not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Role not found with id ${req.params.id}`, 404));
    }

    logger.info(`Fetched role: ${role.name} by ${req.user.id}`);
    res.status(200).json({
      success: true,
      data: role
    });
  } catch (err) {
    logger.error(`Error fetching role: ${err.message}`);
    next(err);
  }
};

// @desc    Update role
// @route   PUT /api/roles/:id
// @access  Private (super_admin)
exports.updateRole = async (req, res, next) => {
  try {
    const { name, description, permissions, is_default } = req.body;

    // Don't allow updating super_admin role
    const existingRole = await Role.findById(req.params.id);
    if (existingRole.name === 'super_admin') {
      return next(new ErrorResponse('Cannot modify super_admin role', 403));
    }

    const role = await Role.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        permissions,
        is_default
      },
      { new: true, runValidators: true }
    );

    if (!role) {
      logger.warn(`Role not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Role not found with id ${req.params.id}`, 404));
    }

    logger.info(`Updated role: ${role.name} by ${req.user.id}`);
    res.status(200).json({
      success: true,
      data: role
    });
  } catch (err) {
    logger.error(`Error updating role: ${err.message}`);
    next(err);
  }
};

// @desc    Delete role
// @route   DELETE /api/roles/:id
// @access  Private (super_admin)
exports.deleteRole = async (req, res, next) => {
  try {
    // Don't allow deleting super_admin role
    const existingRole = await Role.findById(req.params.id);
    if (existingRole.name === 'super_admin') {
      return next(new ErrorResponse('Cannot delete super_admin role', 403));
    }

    // Check if role is assigned to any users
    const usersWithRole = await User.countDocuments({ role_id: req.params.id });
    
    if (usersWithRole > 0) {
      return next(new ErrorResponse('Cannot delete role assigned to users', 400));
    }

    const role = await Role.findByIdAndDelete(req.params.id);

    if (!role) {
      logger.warn(`Role not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`Role not found with id ${req.params.id}`, 404));
    }

    logger.info(`Deleted role: ${role.name} by ${req.user.id}`);
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    logger.error(`Error deleting role: ${err.message}`);
    next(err);
  }
};

// @desc    Get default roles
// @route   GET /api/roles/defaults
// @access  Private (admin+)
exports.getDefaultRoles = async (req, res, next) => {
  try {
    const roles = await Role.find({ is_default: true })
      .populate('created_by', 'username')
      .sort('name');

    logger.info(`Fetched ${roles.length} default roles by ${req.user.id}`);
    res.status(200).json({
      success: true,
      count: roles.length,
      data: roles
    });
  } catch (err) {
    logger.error(`Error fetching default roles: ${err.message}`);
    next(err);
  }
};