const User = require('../models/User');
const Role = require('../models/Role');
const logger = require('../config/logger');
const { validateUserInput } = require('../utils/validators');
const { ErrorResponse } = require('../utils/errorHandler');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Branch = require('../models/Branch');

// @desc    Register super admin (one-time)
// @route   POST /api/users/register-super-admin
// @access  Public
exports.registerSuperAdmin = async (req, res, next) => {
  try {
    // Check if super admin already exists
    const superAdminExists = await User.superAdminExists();
    if (superAdminExists) {
      logger.warn('Attempt to register additional super admin');
      return next(new ErrorResponse('Super admin already exists', 400));
    }

    // Create super_admin role if not exists
    let superAdminRole = await Role.findOne({ name: 'super_admin' });
    
    if (!superAdminRole) {
      superAdminRole = await Role.create({
        name: 'super_admin',
        description: 'System super administrator with full access',
        permissions: [
          { resource: 'user', actions: ['manage'] },
          { resource: 'role', actions: ['manage'] },
          { resource: 'branch', actions: ['manage'] },
          { resource: 'model', actions: ['manage'] },
          { resource: 'accessory', actions: ['manage'] },
          { resource: 'quotation', actions: ['manage'] }
        ],
        is_default: false
      });
    }

    const { errors, isValid } = validateUserInput(req.body, 'register');
    
    if (!isValid) {
      logger.warn('Super admin registration validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    const { username, email, password, full_name } = req.body;
    
    // Check if username or email already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      logger.warn(`Duplicate user registration attempt: ${username}`);
      return next(new ErrorResponse('Username or email already exists', 400));
    }

    const user = await User.create({
      username,
      email,
      password,
      full_name,
      role_id: superAdminRole._id
    });

    // Create token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    logger.info(`Super admin registered: ${user.username}`);
    res.status(201).json({
      success: true,
      token,
      data: {
        id: user._id,
        username: user.username,
        role: 'super_admin'
      }
    });
  } catch (err) {
    logger.error(`Error registering super admin: ${err.message}`);
    next(err);
  }
};

// @desc    Register user (by admin/super_admin)
// @route   POST /api/users/register
// @access  Private (admin/super_admin)
exports.register = async (req, res, next) => {
  try {
    const { errors, isValid } = validateUserInput(req.body, 'register');
    
    if (!isValid) {
      logger.warn('User registration validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    const { username, email, password, full_name, branch_id, role_id } = req.body;
    
    // Check if username or email already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      logger.warn(`Duplicate user registration attempt: ${username}`);
      return next(new ErrorResponse('Username or email already exists', 400));
    }

    // Validate role assignment and get role name
    const role = await Role.findById(role_id);
    if (!role) {
      return next(new ErrorResponse('Invalid role specified', 400));
    }

    // Validate branch if provided and get branch name
    let branch = null;
    if (branch_id) {
      branch = await Branch.findById(branch_id);
      if (!branch) {
        return next(new ErrorResponse('Invalid branch specified', 400));
      }
    }

    // Get the current user with populated role
    const currentUser = await User.findById(req.user.id).populate('role_id');
    if (!currentUser) {
      return next(new ErrorResponse('User not found', 404));
    }

    // Check if requesting user has permission to assign this role
    if (currentUser.role_id.name !== 'super_admin') {
      const requestingUserRole = await Role.findById(currentUser.role_id);
      if (!requestingUserRole.permissions.some(p => p.resource === 'role' && p.actions.includes('manage'))) {
        return next(new ErrorResponse('Not authorized to assign roles', 403));
      }
    }

    const user = await User.create({
      username,
      email,
      password,
      full_name,
      branch_id,
      role_id,
      created_by: req.user.id
    });

    // Populate the response with branch and role details
    const responseData = {
      id: user._id,
      username: user.username,
      full_name: user.full_name,
      role: {
        id: role._id,
        name: role.name
      }
    };

    if (branch) {
      responseData.branch = {
        id: branch._id,
        name: branch.name
      };
    }

    logger.info(`User registered by ${req.user.id}: ${user.username}`);
    res.status(201).json({
      success: true,
      data: responseData
    });
  } catch (err) {
    logger.error(`Error registering user: ${err.message}`);
    next(err);
  }
};

// @desc    Login user
// @route   POST /api/users/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { errors, isValid } = validateUserInput(req.body, 'login');
    
    if (!isValid) {
      logger.warn('User login validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    const { username, password } = req.body;
    
    const user = await User.findOne({ username }).select('+password').populate('role_id');
    
    if (!user || !(await user.comparePassword(password))) {
      logger.warn(`Failed login attempt for username: ${username}`);
      return next(new ErrorResponse('Invalid credentials', 401));
    }

    // Check if user is active
    if (!user.is_active) {
      logger.warn(`Login attempt for inactive user: ${username}`);
      return next(new ErrorResponse('Account is inactive', 401));
    }

    // Create token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    // Update last login
    user.last_login = new Date();
    await user.save();

    logger.info(`User logged in: ${user.username}`);
    res.status(200).json({
      success: true,
      token,
      data: {
        id: user._id,
        username: user.username,
        full_name: user.full_name,
        role_id: user.role_id,
        branch_id: user.branch_id
      }
    });
  } catch (err) {
    logger.error(`Error logging in user: ${err.message}`);
    next(err);
  }
};

// @desc    Get current user
// @route   GET /api/users/me
// @access  Private
exports.getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('role_id')
      .populate('branch_id', 'name city');

    if (!user) {
      logger.warn(`User not found with id: ${req.user.id}`);
      return next(new ErrorResponse('User not found', 404));
    }

    logger.info(`Fetched current user: ${user.username}`);
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (err) {
    logger.error(`Error fetching current user: ${err.message}`);
    next(err);
  }
};

// @desc    Update current user
// @route   PUT /api/users/me
// @access  Private
exports.updateCurrentUser = async (req, res, next) => {
  try {
    const { password, full_name, email } = req.body;
    const updateFields = {};

    if (full_name) updateFields.full_name = full_name;
    if (email) updateFields.email = email;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateFields.password = await bcrypt.hash(password, salt);
    }

    const user = await User.findByIdAndUpdate(req.user.id, updateFields, {
      new: true,
      runValidators: true
    }).select('-password').populate('role_id');

    logger.info(`Updated current user: ${user.username}`);
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (err) {
    logger.error(`Error updating current user: ${err.message}`);
    next(err);
  }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private (admin/super_admin)
exports.getUsers = async (req, res, next) => {
  try {
    let filter = {};
    
    // If not super admin, filter by permissions
    const currentUser = await User.findById(req.user.id).populate('role_id');
    if (currentUser.role_id.name !== 'super_admin') {
      if (!currentUser.role_id.permissions.some(p => p.resource === 'user' && p.actions.includes('read'))) {
        return next(new ErrorResponse('Not authorized to access this resource', 403));
      }
      
      // Additional filtering based on branch
      if (currentUser.branch_id) {
        filter.branch_id = currentUser.branch_id;
      }
    }

    const users = await User.find(filter)
      .select('-password')
      .populate('branch_id', 'name city')
      .populate('role_id', 'name description')
      .populate('created_by', 'username')
      .sort('username');

    logger.info(`Fetched ${users.length} users by ${req.user.id}`);
    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (err) {
    logger.error(`Error fetching users: ${err.message}`);
    next(err);
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private (admin/super_admin)
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('branch_id', 'name city')
      .populate('role_id', 'name description');

    if (!user) {
      logger.warn(`User not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
    }

    // Authorization check
    const currentUser = await User.findById(req.user.id).populate('role_id');
    if (currentUser.role_id.name !== 'super_admin') {
      if (currentUser.branch_id && user.branch_id && 
          currentUser.branch_id.toString() !== user.branch_id.toString()) {
        return next(new ErrorResponse('Not authorized to access this user', 403));
      }
    }

    logger.info(`Fetched user: ${user.username}`);
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (err) {
    logger.error(`Error fetching user: ${err.message}`);
    next(err);
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (admin/super_admin)
exports.updateUser = async (req, res, next) => {
  try {
    const { errors, isValid } = validateUserInput(req.body, 'update');
    
    if (!isValid) {
      logger.warn('User update validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    let user = await User.findById(req.params.id).populate('role_id');
    if (!user) {
      logger.warn(`User not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
    }

    // Authorization check
    const currentUser = await User.findById(req.user.id).populate('role_id');
    if (currentUser.role_id.name !== 'super_admin') {
      // Check if current user has permission to update users
      if (!currentUser.role_id.permissions.some(p => p.resource === 'user' && p.actions.includes('update'))) {
        return next(new ErrorResponse('Not authorized to update users', 403));
      }

      // Check branch restrictions
      if (currentUser.branch_id && user.branch_id && 
          currentUser.branch_id.toString() !== user.branch_id.toString()) {
        return next(new ErrorResponse('Not authorized to update this user', 403));
      }

      // Prevent role changes unless by super_admin
      if (req.body.role_id) {
        return next(new ErrorResponse('Not authorized to change roles', 403));
      }
    }

    const { password, role_id, is_active } = req.body;
    const updateFields = { ...req.body };

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateFields.password = await bcrypt.hash(password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateFields, {
      new: true,
      runValidators: true
    }).select('-password').populate('role_id');

    logger.info(`Updated user: ${updatedUser.username} by ${req.user.id}`);
    res.status(200).json({
      success: true,
      data: updatedUser
    });
  } catch (err) {
    logger.error(`Error updating user: ${err.message}`);
    next(err);
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (admin/super_admin)
exports.deleteUser = async (req, res, next) => {
  try {
    // Prevent deleting own account
    if (req.user.id === req.params.id) {
      logger.warn(`User ${req.user.id} attempted to delete their own account`);
      return next(new ErrorResponse('You cannot delete your own account', 400));
    }

    const user = await User.findById(req.params.id).populate('role_id');
    if (!user) {
      logger.warn(`User not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
    }

    // Authorization check
    const currentUser = await User.findById(req.user.id).populate('role_id');
    if (currentUser.role_id.name !== 'super_admin') {
      // Check if current user has permission to delete users
      if (!currentUser.role_id.permissions.some(p => p.resource === 'user' && p.actions.includes('delete'))) {
        return next(new ErrorResponse('Not authorized to delete users', 403));
      }

      // Check branch restrictions
      if (currentUser.branch_id && user.branch_id && 
          currentUser.branch_id.toString() !== user.branch_id.toString()) {
        return next(new ErrorResponse('Not authorized to delete this user', 403));
      }

      // Prevent deleting super_admin or admin
      if (user.role_id.name === 'super_admin' || user.role_id.name === 'admin') {
        return next(new ErrorResponse('Not authorized to delete this user', 403));
      }
    }

    await User.findByIdAndDelete(req.params.id);

    logger.info(`Deleted user: ${user.username} by ${req.user.id}`);
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    logger.error(`Error deleting user: ${err.message}`);
    next(err);
  }
};

// @desc    Toggle user active status
// @route   PATCH /api/users/:id/toggle-active
// @access  Private (admin/super_admin)
exports.toggleActive = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).populate('role_id');

    if (!user) {
      logger.warn(`User not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
    }

    // Authorization check
    const currentUser = await User.findById(req.user.id).populate('role_id');
    if (currentUser.role_id.name !== 'super_admin') {
      // Check if current user has permission to update users
      if (!currentUser.role_id.permissions.some(p => p.resource === 'user' && p.actions.includes('update'))) {
        return next(new ErrorResponse('Not authorized to update users', 403));
      }

      // Check branch restrictions
      if (currentUser.branch_id && user.branch_id && 
          currentUser.branch_id.toString() !== user.branch_id.toString()) {
        return next(new ErrorResponse('Not authorized to update this user', 403));
      }

      // Prevent deactivating super_admin or admin
      if (user.role_id.name === 'super_admin' || user.role_id.name === 'admin') {
        return next(new ErrorResponse('Not authorized to deactivate this user', 403));
      }
    }

    // Prevent deactivating super_admin
    if (user.role_id.name === 'super_admin' && req.user.id !== user._id.toString()) {
      logger.warn(`Attempt to deactivate super admin by ${req.user.id}`);
      return next(new ErrorResponse('Cannot deactivate super admin', 403));
    }

    user.is_active = !user.is_active;
    await user.save();

    logger.info(`Toggled active status for user: ${user.username} to ${user.is_active} by ${req.user.id}`);
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (err) {
    logger.error(`Error toggling user active status: ${err.message}`);
    next(err);
  }
};