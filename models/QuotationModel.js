const mongoose = require('mongoose');

const modelItemSchema = new mongoose.Schema({
  model_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Model',
    required: true
  },
  model_name: {
    type: String,
    required: true
  },
  base_price: {
    type: Number,
    required: true
  },
}, { _id: false });

const quotationSchema = new mongoose.Schema({
  quotation_number: {
    type: String,
    unique: true,
    required: true,
    default: function() {
      return `QT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
  },
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  models: [modelItemSchema],
  base_model_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Model'
  },
  base_model_name: String,
  date: {
    type: Date,
    default: Date.now
  },
  expected_delivery_date: Date,
  finance_needed: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['draft', 'sent', 'accepted', 'rejected', 'converted'],
    default: 'draft'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notes: String,
  terms_conditions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TermsCondition'
  }],
pdfUrl: {
    type: String,
    default: null
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for customer details
quotationSchema.virtual('customer', {
  ref: 'Customer',
  localField: 'customer_id',
  foreignField: '_id',
  justOne: true
});

// Virtual for creator details
quotationSchema.virtual('creator', {
  ref: 'User',
  localField: 'createdBy',
  foreignField: '_id',
  justOne: true
});

// Pre-save hook to generate quotation number
quotationSchema.pre('save', async function(next) {
  if (!this.quotation_number) {
    const count = await this.constructor.countDocuments();
    this.quotation_number = `QT-${Date.now()}-${count + 1}`;
  }
  next();
});

const Quotation = mongoose.model('Quotation', quotationSchema);

module.exports = Quotation;