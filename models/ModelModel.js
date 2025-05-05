// ModelModel.js
const mongoose = require('mongoose');

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
}, { _id: false });

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
  prices: {
    type: [priceDataSchema],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
modelSchema.index({ model_name: 1 });
modelSchema.index({ 'prices.header_id': 1 });
modelSchema.index({ 'prices.branch_id': 1 });

const Model = mongoose.model('Model', modelSchema);

module.exports = Model;