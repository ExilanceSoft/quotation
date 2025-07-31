const mongoose = require('mongoose');
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
mobile: {
  type: String,
  required: [true, 'Please add a mobile number'],
  unique: true,
  trim: true,
  validate: {
    validator: function(v) {
      return /^[0-9]{10}$/.test(v);
    },
    message: props => `${props.value} is not a valid 10-digit mobile number!`
  }
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
  },
  otp: {
    type: String,
    select: false
  },
  otpExpire: {
    type: Date,
    select: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  loginAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  lockUntil: {
    type: Date,
    select: false
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.otp;
      delete ret.otpExpire;
      delete ret.loginAttempts;
      delete ret.lockUntil;
      return ret;
    }
  },
  toObject: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.otp;
      delete ret.otpExpire;
      delete ret.loginAttempts;
      delete ret.lockUntil;
      return ret;
    }
  }
});

// Static method to check if super admin exists
userSchema.statics.superAdminExists = async function() {
  const Role = mongoose.model('Role');
  const superAdminRole = await Role.findOne({ name: 'super_admin' });
  if (!superAdminRole) return false;
  
  return this.exists({ role_id: superAdminRole._id });
};

// Virtual for role name
userSchema.virtual('role', {
  ref: 'Role',
  localField: 'role_id',
  foreignField: '_id',
  justOne: true
});

// Virtual for branch details
userSchema.virtual('branch', {
  ref: 'Branch',
  localField: 'branch_id',
  foreignField: '_id',
  justOne: true
});

// Log before saving
userSchema.pre('save', function(next) {
  logger.info(`Saving user: ${this.username}`);
  next();
});

module.exports = mongoose.model('User', userSchema);