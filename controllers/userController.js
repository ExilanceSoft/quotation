const User = require('../models/User');
const Role = require('../models/Role');
const logger = require('../config/logger');
const { validateUserInput } = require('../utils/validators');
const { ErrorResponse } = require('../utils/errorHandler');
const jwt = require('jsonwebtoken');
const Branch = require('../models/Branch');
const { generateOTP, sendOTPEmail } = require('../utils/emailService');

// Helper function to format user response
const formatUserResponse = (user) => {
  const userObj = user.toObject ? user.toObject() : user;
  
  // Remove sensitive fields
  delete userObj.otp;
  delete userObj.otpExpire;
  delete userObj.loginAttempts;
  delete userObj.lockUntil;

  // Add virtuals if they exist
  if (user.role) {
    userObj.role = user.role;
  }
  if (user.branch) {
    userObj.branch = user.branch;
  }

  return userObj;
};

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

    // Validate input
    const { errors, isValid } = validateUserInput(req.body, 'register');
    if (!isValid) {
      logger.warn('Super admin registration validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    // Create super_admin role if not exists
    let superAdminRole = await Role.findOne({ name: 'super_admin' });
    
    if (!superAdminRole) {
      superAdminRole = await Role.create({
        name: 'super_admin',
        description: 'System super administrator with full access',
        permissions: [
          { resource: 'user', actions: ['create', 'read', 'update', 'delete'] },
          { resource: 'role', actions: ['create', 'read', 'update', 'delete'] },
          { resource: 'branch', actions: ['create', 'read', 'update', 'delete'] },
          { resource: 'model', actions: ['create', 'read', 'update', 'delete'] },
          { resource: 'accessory', actions: ['create', 'read', 'update', 'delete'] },
          { resource: 'quotation', actions: ['create', 'read', 'update', 'delete'] }
        ],
        is_default: false
      });
      logger.info('Super admin role created');
    }

    const { username, email, full_name, mobile } = req.body;
    
    // Check if username, email or mobile already exists
    const existingUser = await User.findOne({ 
      $or: [
        { username: username.toLowerCase() }, 
        { email: email.toLowerCase() }, 
        { mobile } 
      ] 
    });
    
    if (existingUser) {
      let conflictField = '';
      if (existingUser.username === username.toLowerCase()) conflictField = 'username';
      else if (existingUser.email === email.toLowerCase()) conflictField = 'email';
      else conflictField = 'mobile';
      
      logger.warn(`Duplicate ${conflictField} during super admin registration: ${username}`);
      return next(new ErrorResponse(`${conflictField.charAt(0).toUpperCase() + conflictField.slice(1)} already exists`, 400));
    }

    // Create super admin user
    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      mobile,
      full_name,
      role_id: superAdminRole._id,
      is_active: true,
      isVerified: true,
      created_by: null // No creator for super admin
    });

    // Create token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '30d' }
    );

    const userResponse = formatUserResponse(user);

    logger.info(`Super admin registered successfully: ${user.username}`);
    res.status(201).json({
      success: true,
      token,
      data: {
        ...userResponse,
        role: {
          name: 'super_admin',
          permissions: superAdminRole.permissions
        }
      }
    });
  } catch (err) {
    logger.error(`Error registering super admin: ${err.message}`, { stack: err.stack });
    next(new ErrorResponse('Server error during super admin registration', 500));
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

    const { username, email, full_name, branch_id, role_id, mobile } = req.body;
    
    // Check if username, email or mobile already exists
    const existingUser = await User.findOne({ 
      $or: [
        { username: username.toLowerCase() }, 
        { email: email.toLowerCase() }, 
        { mobile } 
      ] 
    });
    
    if (existingUser) {
      let conflictField = '';
      if (existingUser.username === username.toLowerCase()) conflictField = 'username';
      else if (existingUser.email === email.toLowerCase()) conflictField = 'email';
      else conflictField = 'mobile';
      
      logger.warn(`Duplicate ${conflictField} during user registration: ${username}`);
      return next(new ErrorResponse(`${conflictField.charAt(0).toUpperCase() + conflictField.slice(1)} already exists`, 400));
    }

    // Validate role assignment
    const role = await Role.findById(role_id);
    if (!role) {
      return next(new ErrorResponse('Invalid role specified', 400));
    }

    // Validate branch if provided
    let branch = null;
    if (branch_id) {
      branch = await Branch.findById(branch_id);
      if (!branch) {
        return next(new ErrorResponse('Invalid branch specified', 400));
      }
    }

    // Check permissions of the requesting user
    const currentUser = await User.findById(req.user.id).populate('role_id');
    if (!currentUser) {
      return next(new ErrorResponse('User not found', 404));
    }

    // Only super admin can assign super_admin role
    if (role.name === 'super_admin' && currentUser.role_id.name !== 'super_admin') {
      return next(new ErrorResponse('Not authorized to assign super_admin role', 403));
    }

    // Check if requesting user has permission to assign this role
    if (currentUser.role_id.name !== 'super_admin') {
      const hasRolePermission = currentUser.role_id.permissions.some(
        p => p.resource === 'role' && p.actions.includes('assign')
      );
      if (!hasRolePermission) {
        return next(new ErrorResponse('Not authorized to assign roles', 403));
      }
    }

    // Create the new user
    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      mobile,
      full_name,
      branch_id,
      role_id,
      created_by: req.user.id
    });

    // Generate OTP for initial verification
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();
    
    // Send OTP email
    await sendOTPEmail(user.email, otp);

    const userResponse = formatUserResponse(user);

    logger.info(`User registered by ${req.user.id}: ${user.username}`);
    res.status(201).json({
      success: true,
      data: userResponse
    });
  } catch (err) {
    logger.error(`Error registering user: ${err.message}`, { stack: err.stack });
    next(new ErrorResponse('Server error during user registration', 500));
  }
};

// @desc    Login user (initiates OTP flow)
// @route   POST /api/users/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    // Only validate email for login
    if (!req.body.email || !req.body.email.trim()) {
      return next(new ErrorResponse('Email is required', 400));
    }

    const email = req.body.email.toLowerCase().trim();
    
    const user = await User.findOne({ email })
      .select('+otp +otpExpire +loginAttempts +lockUntil')
      .populate('role_id');
    
    if (!user) {
      logger.warn(`Failed login attempt for email: ${email}`);
      return next(new ErrorResponse('Invalid credentials', 401));
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const retryAfter = Math.ceil((user.lockUntil - Date.now()) / 1000);
      return next(new ErrorResponse(
        `Account temporarily locked. Try again in ${retryAfter} seconds`, 
        429,
        { retryAfter }
      ));
    }

    // Check if user is active
    if (!user.is_active) {
      logger.warn(`Login attempt for inactive user: ${email}`);
      return next(new ErrorResponse('Account is inactive', 401));
    }

    // Generate OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    
    await user.save();
    
    // Send OTP email
    await sendOTPEmail(user.email, otp);

    logger.info(`OTP sent to user: ${user.email}`);
    res.status(200).json({
      success: true,
      message: 'OTP sent to your email',
      data: {
        email: user.email,
        otpExpiresIn: 600 // 10 minutes in seconds
      }
    });
  } catch (err) {
    logger.error(`Error in login process: ${err.message}`);
    next(new ErrorResponse('Server error during login', 500));
  }
};

// @desc    Verify OTP
// @route   POST /api/users/verify-otp
// @access  Public
exports.verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return next(new ErrorResponse('Please provide email and OTP', 400));
    }

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+otp +otpExpire')
      .populate('role_id');
    
    if (!user) {
      return next(new ErrorResponse('Invalid credentials', 401));
    }

    if (user.otp !== otp || user.otpExpire < Date.now()) {
      // Increment failed attempts
      user.loginAttempts += 1;
      
      // Lock account after 5 failed attempts
      if (user.loginAttempts >= 5) {
        user.lockUntil = Date.now() + 15 * 60 * 1000; // 15 minutes lock
        await user.save();
        return next(new ErrorResponse(
          'Too many failed attempts. Account locked for 15 minutes',
          429
        ));
      }
      
      await user.save();
      return next(new ErrorResponse('Invalid or expired OTP', 401));
    }

    // Clear OTP fields
    user.otp = undefined;
    user.otpExpire = undefined;
    user.isVerified = true;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    // Create token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '30d' }
    );

    // Update last login
    user.last_login = new Date();
    await user.save();

    const userResponse = formatUserResponse(user);

    logger.info(`User logged in: ${user.email}`);
    res.status(200).json({
      success: true,
      token,
      data: userResponse
    });
  } catch (err) {
    logger.error(`Error verifying OTP: ${err.message}`, { stack: err.stack });
    next(new ErrorResponse('Server error during OTP verification', 500));
  }
};

// @desc    Get current user
// @route   GET /api/users/me
// @access  Private
exports.getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('role_id')
      .populate('branch_id', 'name city');

    if (!user) {
      logger.warn(`User not found with id: ${req.user.id}`);
      return next(new ErrorResponse('User not found', 404));
    }

    const userResponse = formatUserResponse(user);

    logger.info(`Fetched current user: ${user.username}`);
    res.status(200).json({
      success: true,
      data: userResponse
    });
  } catch (err) {
    logger.error(`Error fetching current user: ${err.message}`, { stack: err.stack });
    next(new ErrorResponse('Server error fetching user', 500));
  }
};

// @desc    Update current user
// @route   PUT /api/users/me
// @access  Private
exports.updateCurrentUser = async (req, res, next) => {
  try {
    const { full_name, email } = req.body;
    const updateFields = {};

    if (full_name) updateFields.full_name = full_name;
    if (email) {
      // Check if email already exists for another user
      const existingUser = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: req.user.id }
      });
      if (existingUser) {
        return next(new ErrorResponse('Email already in use', 400));
      }
      updateFields.email = email.toLowerCase();
    }

    const user = await User.findByIdAndUpdate(req.user.id, updateFields, {
      new: true,
      runValidators: true
    }).populate('role_id');

    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    const userResponse = formatUserResponse(user);

    logger.info(`Updated current user: ${user.username}`);
    res.status(200).json({
      success: true,
      data: userResponse
    });
  } catch (err) {
    logger.error(`Error updating current user: ${err.message}`, { stack: err.stack });
    next(new ErrorResponse('Server error updating user', 500));
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
    if (!currentUser) {
      return next(new ErrorResponse('User not found', 404));
    }

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
      .populate('branch_id', 'name city')
      .populate('role_id', 'name description')
      .populate('created_by', 'username')
      .sort('username');

    const usersResponse = users.map(user => formatUserResponse(user));

    logger.info(`Fetched ${users.length} users by ${req.user.id}`);
    res.status(200).json({
      success: true,
      count: users.length,
      data: usersResponse
    });
  } catch (err) {
    logger.error(`Error fetching users: ${err.message}`, { stack: err.stack });
    next(new ErrorResponse('Server error fetching users', 500));
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private (admin/super_admin)
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('branch_id', 'name city')
      .populate('role_id', 'name description');

    if (!user) {
      logger.warn(`User not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
    }

    // Authorization check
    const currentUser = await User.findById(req.user.id).populate('role_id');
    if (!currentUser) {
      return next(new ErrorResponse('User not found', 404));
    }

    if (currentUser.role_id.name !== 'super_admin') {
      if (currentUser.branch_id && user.branch_id && 
          currentUser.branch_id.toString() !== user.branch_id.toString()) {
        return next(new ErrorResponse('Not authorized to access this user', 403));
      }
    }

    const userResponse = formatUserResponse(user);

    logger.info(`Fetched user: ${user.username}`);
    res.status(200).json({
      success: true,
      data: userResponse
    });
  } catch (err) {
    logger.error(`Error fetching user: ${err.message}`, { stack: err.stack });
    next(new ErrorResponse('Server error fetching user', 500));
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
    if (!currentUser) {
      return next(new ErrorResponse('User not found', 404));
    }

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

    // Check for duplicate email
    if (req.body.email) {
      const existingUser = await User.findOne({
        email: req.body.email.toLowerCase(),
        _id: { $ne: req.params.id }
      });
      if (existingUser) {
        return next(new ErrorResponse('Email already in use', 400));
      }
    }

    const updateFields = { ...req.body };
    if (updateFields.email) {
      updateFields.email = updateFields.email.toLowerCase();
    }
    if (updateFields.username) {
      updateFields.username = updateFields.username.toLowerCase();
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateFields, {
      new: true,
      runValidators: true
    }).populate('role_id');

    const userResponse = formatUserResponse(updatedUser);

    logger.info(`Updated user: ${updatedUser.username} by ${req.user.id}`);
    res.status(200).json({
      success: true,
      data: userResponse
    });
  } catch (err) {
    logger.error(`Error updating user: ${err.message}`, { stack: err.stack });
    next(new ErrorResponse('Server error updating user', 500));
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
    if (!currentUser) {
      return next(new ErrorResponse('User not found', 404));
    }

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
    logger.error(`Error deleting user: ${err.message}`, { stack: err.stack });
    next(new ErrorResponse('Server error deleting user', 500));
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
    if (!currentUser) {
      return next(new ErrorResponse('User not found', 404));
    }

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

    const userResponse = formatUserResponse(user);

    logger.info(`Toggled active status for user: ${user.username} to ${user.is_active} by ${req.user.id}`);
    res.status(200).json({
      success: true,
      data: userResponse
    });
  } catch (err) {
    logger.error(`Error toggling user active status: ${err.message}`, { stack: err.stack });
    next(new ErrorResponse('Server error toggling user status', 500));
  }
};