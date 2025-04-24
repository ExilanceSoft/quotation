const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const logger = require('../config/logger');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Please add a username'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot be more than 30 characters']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  full_name: {
    type: String,
    required: [true, 'Please add a full name'],
    trim: true,
    maxlength: [100, 'Full name cannot be more than 100 characters']
  },
  branch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  },
  role_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
  is_active: {
    type: Boolean,
    default: true
  },
  last_login: {
    type: Date
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

// Static method to check if super admin exists
userSchema.statics.superAdminExists = async function() {
  const Role = mongoose.model('Role');
  const superAdminRole = await Role.findOne({ name: 'super_admin' });
  if (!superAdminRole) return false;
  
  return this.exists({ role_id: superAdminRole._id });
};

// Encrypt password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    logger.info(`Hashed password for user: ${this.username}`);
    next();
  } catch (err) {
    logger.error('Error hashing password:', err);
    next(err);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual for role name
userSchema.virtual('role', {
  ref: 'Role',
  localField: 'role_id',
  foreignField: '_id',
  justOne: true
});

// Log before saving
userSchema.pre('save', function(next) {
  logger.info(`Saving user: ${this.username}`);
  next();
});

module.exports = mongoose.model('User', userSchema);