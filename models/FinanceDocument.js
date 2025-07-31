const mongoose = require('mongoose');

const financeDocumentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Document name is required'],
    trim: true,
    unique: true,  // This automatically creates a unique index
    validate: {
      validator: function(v) {
        return v.length >= 2; // Minimum 2 characters
      },
      message: 'Document name must be at least 2 characters long'
    }
  },
  isRequired: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  // createdAt and updatedAt are automatically handled by timestamps
}, {
  timestamps: true,  // Automatically manages createdAt and updatedAt
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;  // Remove version key from output
      return ret;
    }
  },
  toObject: { 
    virtuals: true 
  },
  collation: {  // Case-insensitive sorting
    locale: 'en',
    strength: 2
  }
});

// Remove this duplicate index - it's already created by 'unique: true' above
// financeDocumentSchema.index({ name: 1 }, { unique: true });

// If you need compound indexes, define them here:
// financeDocumentSchema.index({ name: 1, isRequired: 1 });

module.exports = mongoose.model('FinanceDocument', financeDocumentSchema);