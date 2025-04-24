const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../config/logger');
const { ErrorResponse } = require('../utils/errorHandler');

// Protect routes - user must be logged in
exports.protect = async (req, res, next) => {
  let token;

  // Get token from header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    logger.warn('Attempt to access protected route without token');
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Add user to request object
    req.user = await User.findById(decoded.id).select('-password').populate('role_id');
    
    if (!req.user) {
      return next(new ErrorResponse('User not found', 404));
    }

    next();
  } catch (err) {
    logger.error('Error verifying token:', err);
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
};

// Grant access based on roles and permissions
exports.authorize = (roles = [], resource, action) => {
  return async (req, res, next) => {
    try {
      // Ensure user has a role
      if (!req.user || !req.user.role_id) {
        logger.warn('User has no role assigned');
        return next(new ErrorResponse('Not authorized to access this route', 403));
      }

      // Super admin has all permissions
      if (req.user.role_id.name === 'super_admin') {
        return next();
      }

      // Check if user has one of the required roles
      if (roles.length > 0 && !roles.includes(req.user.role_id.name)) {
        logger.warn(
          `User ${req.user._id} with role ${req.user.role_id.name} attempted unauthorized access`
        );
        return next(new ErrorResponse('Not authorized to access this route', 403));
      }

      // Check if user has the required permission
      const hasPermission = req.user.role_id.permissions?.some(
        p => p.resource === resource && p.actions.includes(action)
      );

      if (!hasPermission) {
        logger.warn(
          `User ${req.user._id} attempted unauthorized access to ${resource} ${action}`
        );
        return next(
          new ErrorResponse(
            `Not authorized to ${action} ${resource}`,
            403
          )
        );
      }
      next();
    } catch (err) {
      logger.error('Error in authorization middleware:', err);
      next(err);
    }
  };
};