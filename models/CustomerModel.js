const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  taluka: {
    type: String,
    required: [true, 'Taluka is required'],
    trim: true
  },
  district: {
    type: String,
    required: [true, 'District is required'],
    trim: true
  },
  mobile1: {
    type: String,
    required: [true, 'Mobile number is required'],
    match: [/^[0-9]{10}$/, 'Please add a valid 10-digit mobile number']
  },
  mobile2: {
    type: String,
    match: [/^[0-9]{10}$/, 'Please add a valid 10-digit mobile number']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;