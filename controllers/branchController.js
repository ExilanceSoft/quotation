const Branch = require('../models/Branch');
const ErrorResponse = require('../utils/errorHandler');
const logger = require('../config/logger');

// @desc    Get all branches
// @route   GET /api/branches
// @access  Public
exports.getBranches = async (req, res, next) => {
  try {
    // Filtering active branches if requested
    let query;
    if (req.query.active === 'true') {
      query = Branch.find({ is_active: true });
    } else if (req.query.active === 'false') {
      query = Branch.find({ is_active: false });
    } else {
      query = Branch.find();
    }

    // Sorting
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    // Executing query
    const branches = await query;

    res.status(200).json({
      success: true,
      count: branches.length,
      data: branches
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single branch
// @route   GET /api/branches/:id
// @access  Public
exports.getBranch = async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return next(
        new ErrorResponse(`Branch not found with id of ${req.params.id}`, 404)
      );
    }

    res.status(200).json({
      success: true,
      data: branch
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new branch
// @route   POST /api/branches
// @access  Private/SuperAdmin
exports.createBranch = async (req, res, next) => {
  try {
    // Check if user is super admin
    if (req.user.role_id.name !== 'super_admin') {
      return next(new ErrorResponse('Not authorized to create branches', 403));
    }

    // Check if branch with same name already exists
    const existingBranch = await Branch.findOne({ name: req.body.name });
    if (existingBranch) {
      return next(
        new ErrorResponse(`Branch with name '${req.body.name}' already exists`, 400)
      );
    }

    const branch = await Branch.create(req.body);

    logger.info(`New branch created: ${branch.name} by user ${req.user.id}`);
    res.status(201).json({
      success: true,
      data: branch
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update branch
// @route   PUT /api/branches/:id
// @access  Private/SuperAdmin
exports.updateBranch = async (req, res, next) => {
  try {
    // Check if user is super admin
    if (req.user.role_id.name !== 'super_admin') {
      return next(new ErrorResponse('Not authorized to update branches', 403));
    }

    let branch = await Branch.findById(req.params.id);

    if (!branch) {
      return next(
        new ErrorResponse(`Branch not found with id of ${req.params.id}`, 404)
      );
    }

    // Check if name is being updated and if it conflicts with existing branch
    if (req.body.name && req.body.name !== branch.name) {
      const existingBranch = await Branch.findOne({ name: req.body.name });
      if (existingBranch) {
        return next(
          new ErrorResponse(`Branch with name '${req.body.name}' already exists`, 400)
        );
      }
    }

    branch = await Branch.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    logger.info(`Branch updated: ${branch.name} by user ${req.user.id}`);
    res.status(200).json({
      success: true,
      data: branch
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete branch
// @route   DELETE /api/branches/:id
// @access  Private/SuperAdmin
exports.deleteBranch = async (req, res, next) => {
  try {
    // Check if user is super admin
    if (req.user.role_id.name !== 'super_admin') {
      return next(new ErrorResponse('Not authorized to delete branches', 403));
    }

    const branch = await Branch.findByIdAndDelete(req.params.id);

    if (!branch) {
      return next(
        new ErrorResponse(`Branch not found with id of ${req.params.id}`, 404)
      );
    }

    logger.info(`Branch permanently deleted: ${branch.name} by user ${req.user.id}`);
    res.status(200).json({
      success: true,
      data: branch // Return the deleted branch data
    });
  } catch (err) {
    next(err);
  }
};