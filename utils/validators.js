

const validator = require('validator');
const { ErrorResponse } = require('./errorHandler');

exports.validateUserInput = (data, action) => {
  const errors = {};
  
  // Trim all string inputs to remove whitespace
  const trimmedEmail = data.email ? data.email.trim() : '';
  const trimmedMobile = data.mobile ? data.mobile.trim() : '';

  // Common validations for all actions
  if (!trimmedEmail) {
    errors.email = 'Email is required';
  } else if (!validator.isEmail(trimmedEmail)) {
    errors.email = 'Please include a valid email';
  }

  // Mobile validation
  if (!trimmedMobile) {
    errors.mobile = 'Mobile number is required';
  } else if (!validator.isMobilePhone(trimmedMobile, 'any', { strictMode: false })) {
    errors.mobile = 'Please include a valid mobile number';
  }

  // Additional validations for register and update actions
  if (action === 'register' || action === 'update') {
    const trimmedUsername = data.username ? data.username.trim() : '';
    const trimmedFullName = data.full_name ? data.full_name.trim() : '';

    if (!trimmedUsername) {
      errors.username = 'Username is required';
    } else if (!validator.isLength(trimmedUsername, { min: 3, max: 30 })) {
      errors.username = 'Username must be between 3 and 30 characters';
    } else if (!validator.isAlphanumeric(trimmedUsername)) {
      errors.username = 'Username can only contain letters and numbers';
    }

    if (!trimmedFullName) {
      errors.full_name = 'Full name is required';
    } else if (!validator.isLength(trimmedFullName, { min: 2, max: 100 })) {
      errors.full_name = 'Full name must be between 2 and 100 characters';
    }
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0
  };
};

exports.validateModelInput = (data) => {
  const errors = {};
  
  // Required fields validation
  if (!data.name || !data.name.trim()) {
    errors.name = 'Model name is required';
  } else if (data.name.trim().length > 100) {
    errors.name = 'Name cannot be more than 100 characters';
  }

  if (!data.model_group || !data.model_group.trim()) {
    errors.model_group = 'Model group is required';
  }

  if (!data.branch_id) {
    errors.branch_id = 'Branch is required';
  }

  if (!data.ex_showroom_price) {
    errors.ex_showroom_price = 'Ex-showroom price is required';
  } else if (isNaN(data.ex_showroom_price) || data.ex_showroom_price < 0) {
    errors.ex_showroom_price = 'Price must be a positive number';
  }

  if (!data.rto_tax_percentage) {
    errors.rto_tax_percentage = 'RTO tax percentage is required';
  } else if (isNaN(data.rto_tax_percentage) || data.rto_tax_percentage < 0 || data.rto_tax_percentage > 100) {
    errors.rto_tax_percentage = 'Tax percentage must be between 0 and 100';
  }

  if (!data.default_insurance) {
    errors.default_insurance = 'Default insurance amount is required';
  } else if (isNaN(data.default_insurance) || data.default_insurance < 0) {
    errors.default_insurance = 'Insurance amount must be a positive number';
  }

  // Optional fields validation


  if (data.engine_cc && (isNaN(data.engine_cc) || data.engine_cc < 0)) {
    errors.engine_cc = 'Engine CC must be a positive number';
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0
  };
};