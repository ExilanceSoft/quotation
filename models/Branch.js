const mongoose = require('mongoose');
const logger = require('../config/logger');

const branchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a branch name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  address: {
    type: String,
    required: [true, 'Please add an address'],
    trim: true
  },
  city: {
    type: String,
    required: [true, 'Please add a city'],
    trim: true
  },
  state: {
    type: String,
    required: [true, 'Please add a state'],
    trim: true
  },
  pincode: {
    type: String,
    required: [true, 'Please add a pincode'],
    trim: true,
    match: [/^[1-9][0-9]{5}$/, 'Please add a valid 6-digit pincode']
  },
  phone: {
    type: String,
    required: [true, 'Please add a phone number'],
    trim: true,
    match: [/^[0-9]{10}$/, 'Please add a valid 10-digit phone number']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  gst_number: {
    type: String,
    trim: true,
    uppercase: true,
    match: [
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      'Please add a valid GST number'
    ]
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster querying
branchSchema.index({ city: 1, state: 1 });
branchSchema.index({ is_active: 1 });

// Log before saving
branchSchema.pre('save', function(next) {
  logger.info(`Saving branch: ${this.name}`);
  next();
});

module.exports = mongoose.model('Branch', branchSchema);