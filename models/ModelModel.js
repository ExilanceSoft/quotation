const mongoose = require('mongoose');

// Price Data Subdocument Schema
const priceDataSchema = new mongoose.Schema({
  value: {
    type: Number,
    required: true,
    min: 0
  },
  header_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Header',
    required: true
  },
  branch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  }
}, {
  _id: false,  // Disable _id for subdocuments
  versionKey: false  // Disable version key for subdocuments
});

// Main Model Schema
const modelSchema = new mongoose.Schema({
  model_name: {
    type: String,
    required: [true, 'Model name is required'],
    unique: true,
    trim: true,
    validate: {
      validator: function(v) {
        return !v.includes(','); // Prevent commas in model names
      },
      message: 'Model name cannot contain commas'
    }
  },
  type: {
    type: String,
    required: [true, 'Type is required (EV/ICE)'],
    enum: ['EV', 'ICE'],
    uppercase: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
    trim: true,
    lowercase: true
  },
  prices: {
    type: [priceDataSchema],
    default: [],
    validate: {
      validator: function(prices) {
        return true;
      }
    }
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, {
  timestamps: false,
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret._id;
      return ret;
    }
  },
  toObject: {
    virtuals: true
  },
  collation: {
    locale: 'en',
    strength: 2
  }
});

// Add error handling for duplicate key errors
modelSchema.post('save', function(error, doc, next) {
  if (error.name === 'MongoError' && error.code === 11000) {
    next(new Error('Model name must be unique'));
  } else {
    next(error);
  }
});

// Compound Indexes
modelSchema.index({ 'prices.header_id': 1 });
modelSchema.index({ 'prices.branch_id': 1 });
modelSchema.index({ status: 1 }); // New index for status field

const Model = mongoose.model('Model', modelSchema);

module.exports = Model;