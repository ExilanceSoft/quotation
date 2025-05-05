const mongoose = require('mongoose');

const financeDocumentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Document name is required'],
    trim: true,
    unique: true
  },
  isRequired: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true
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

// Ensure the name is unique
financeDocumentSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('FinanceDocument', financeDocumentSchema);