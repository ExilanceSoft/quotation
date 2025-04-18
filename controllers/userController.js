const User = require('../models/User');
const logger = require('../config/logger');
const { validateUserInput } = require('../utils/validators');
const { ErrorResponse } = require('../utils/errorHandler');
const jwt = require('jsonwebtoken');

// @desc    Register user
// @route   POST /api/users/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { errors, isValid } = validateUserInput(req.body, 'register');
    
    if (!isValid) {
      logger.warn('User registration validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    const { username, email, password, full_name, branch_id, role } = req.body;
    
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
      branch_id,
      role: role || 'sales'
    });

    // Create token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    logger.info(`User registered: ${user.username}`);
    res.status(201).json({
      success: true,
      token,
      data: {
        id: user._id,
        username: user.username,
        role: user.role
      }
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
    
    const user = await User.findOne({ username }).select('+password');
    
    if (!user || !(await user.comparePassword(password))) {
      logger.warn(`Failed login attempt for username: ${username}`);
      return next(new ErrorResponse('Invalid credentials', 401));
    }

    // Create token
    const token = jwt.sign(
      { id: user._id, role: user.role },
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
        role: user.role,
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
    }).select('-password');

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
// @access  Private/Admin
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find()
      .select('-password')
      .populate('branch_id', 'name city')
      .sort('username');

    logger.info(`Fetched ${users.length} users`);
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
// @access  Private/Admin
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('branch_id', 'name city');

    if (!user) {
      logger.warn(`User not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
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
// @access  Private/Admin
exports.updateUser = async (req, res, next) => {
  try {
    const { errors, isValid } = validateUserInput(req.body, 'update');
    
    if (!isValid) {
      logger.warn('User update validation failed', errors);
      return next(new ErrorResponse('Invalid input data', 400, errors));
    }

    const { password, role, is_active } = req.body;
    const updateFields = { ...req.body };

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateFields.password = await bcrypt.hash(password, salt);
    }

    // Prevent non-admins from changing roles or active status
    if (req.user.role !== 'admin') {
      delete updateFields.role;
      delete updateFields.is_active;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateFields, {
      new: true,
      runValidators: true
    }).select('-password');

    if (!user) {
      logger.warn(`User not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
    }

    logger.info(`Updated user: ${user.username}`);
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (err) {
    logger.error(`Error updating user: ${err.message}`);
    next(err);
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res, next) => {
  try {
    // Prevent deleting own account
    if (req.user.id === req.params.id) {
      logger.warn(`User ${req.user.id} attempted to delete their own account`);
      return next(new ErrorResponse('You cannot delete your own account', 400));
    }

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      logger.warn(`User not found with id: ${req.params.id}`);
      return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
    }

    logger.info(`Deleted user: ${user.username}`);
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
// @route   PATCH /api/users/:id
//toggle-active
// @access Private/Admin
