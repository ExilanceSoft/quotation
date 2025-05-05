const mongoose = require('mongoose');

const termsConditionSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true
  },
  content: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('TermsCondition', termsConditionSchema);