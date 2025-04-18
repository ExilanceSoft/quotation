const mongoose = require('mongoose');
const logger = require('../config/logger');

const accessorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    unique: true,
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  base_price: {
    type: Number,
    required: [true, 'Please add a base price'],
    min: [0, 'Price must be at least 0']
  },
  category: {
    type: String,
    enum: ['safety', 'comfort', 'performance', 'cosmetic', 'other'],
    default: 'other'
  },
  image_url: {
    type: String,
    trim: true,
    match: [
      /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
      'Please use a valid URL with HTTP or HTTPS'
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

// Log before saving
accessorySchema.pre('save', function(next) {
  logger.info(`Saving accessory: ${this.name}`);
  next();
});

module.exports = mongoose.model('Accessory', accessorySchema);