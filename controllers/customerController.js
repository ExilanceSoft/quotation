const Customer = require('../models/CustomerModel');
const AppError = require('../utils/appError');
const logger = require('../config/logger');

// @desc    Create a new customer
// @route   POST /api/customers
// @access  Private
exports.createCustomer = async (req, res, next) => {
  try {
    const { name, address, taluka, district, mobile1, mobile2 } = req.body;

    // Validate required fields
    if (!name || !address || !mobile1) {
      return next(new AppError('Name, address and mobile1 are required fields', 400));
    }

    const customer = await Customer.create({
      name,
      address,
      taluka: taluka || '',
      district: district || '',
      mobile1,
      mobile2: mobile2 || '',
      createdBy: req.user.id
    });

    res.status(201).json({
      status: 'success',
      data: {
        customer
      }
    });
  } catch (err) {
    logger.error(`Error creating customer: ${err.message}`);
    next(err);
  }
};

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
exports.getAllCustomers = async (req, res, next) => {
  try {
    // Filtering
    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach(el => delete queryObj[el]);

    // Advanced filtering
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    
    let query = Customer.find(JSON.parse(queryStr));

    // Sorting
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    // Field limiting
    if (req.query.fields) {
      const fields = req.query.fields.split(',').join(' ');
      query = query.select(fields);
    } else {
      query = query.select('-__v');
    }

    // Pagination
    const page = req.query.page * 1 || 1;
    const limit = req.query.limit * 1 || 100;
    const skip = (page - 1) * limit;

    query = query.skip(skip).limit(limit);

    const customers = await query;

    res.status(200).json({
      status: 'success',
      results: customers.length,
      data: {
        customers
      }
    });
  } catch (err) {
    logger.error(`Error getting customers: ${err.message}`);
    next(err);
  }
};

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Private
exports.getCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return next(new AppError('No customer found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        customer
      }
    });
  } catch (err) {
    logger.error(`Error getting customer: ${err.message}`);
    next(err);
  }
};

// @desc    Update customer
// @route   PATCH /api/customers/:id
// @access  Private
exports.updateCustomer = async (req, res, next) => {
  try {
    const { name, address, taluka, district, mobile1, mobile2 } = req.body;

    // Validate mobile numbers if provided
    if (mobile1 && !/^[0-9]{10}$/.test(mobile1)) {
      return next(new AppError('Please provide a valid 10-digit mobile number for mobile1', 400));
    }
    if (mobile2 && !/^[0-9]{10}$/.test(mobile2)) {
      return next(new AppError('Please provide a valid 10-digit mobile number for mobile2', 400));
    }

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      {
        name,
        address,
        taluka,
        district,
        mobile1,
        mobile2
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!customer) {
      return next(new AppError('No customer found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        customer
      }
    });
  } catch (err) {
    logger.error(`Error updating customer: ${err.message}`);
    next(err);
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private (Admin only)
exports.deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);

    if (!customer) {
      return next(new AppError('No customer found with that ID', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    logger.error(`Error deleting customer: ${err.message}`);
    next(err);
  }
};