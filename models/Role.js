const mongoose = require('mongoose');
const logger = require('../config/logger');

const permissionSchema = new mongoose.Schema({
  resource: {
    type: String,
    required: true,
    enum: ['user', 'role', 'branch', 'model', 'accessory', 'quotation']
  },
  actions: {
    type: [String],
    required: true,
    enum: ['create', 'read', 'update', 'delete', 'manage']
  }
});

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a role name'],
    unique: true,
    trim: true,
    maxlength: [50, 'Role name cannot be more than 50 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  permissions: [permissionSchema],
  is_default: {
    type: Boolean,
    default: false
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Prevent duplicate permissions for same resource
roleSchema.pre('save', function(next) {
  const uniqueResources = new Set();
  this.permissions.forEach(perm => {
    if (uniqueResources.has(perm.resource)) {
      throw new Error(`Duplicate permission for resource: ${perm.resource}`);
    }
    uniqueResources.add(perm.resource);
  });
  next();
});

// Log before saving
roleSchema.pre('save', function(next) {
  logger.info(`Saving role: ${this.name}`);
  next();
});

module.exports = mongoose.model('Role', roleSchema);