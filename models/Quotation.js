const mongoose = require('mongoose');
const logger = require('../config/logger');

const customerDetailsSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  address: {
    type: String,
  },
  primary_mobile: {
    type: String,
    required: true,
  },
  secondary_mobile: {
    type: String,
  },
  taluka: {
    type: String,
  },
  district: {
    type: String,
  },
  email: {
    type: String,
  },
});

const technicalSpecsSchema = new mongoose.Schema({
  engine_cc: {
    type: Number,
  },
  fuel_type: {
    type: String,
  },
  gearbox: {
    type: String,
  },
});

const pricingBreakdownSchema = new mongoose.Schema({
  ex_showroom: {
    type: Number,
    required: true,
  },
  rto_tax: {
    type: Number,
    required: true,
  },
  insurance: {
    type: Number,
    required: true,
  },
  pdi_handling: {
    type: Number,
    required: true,
  },
  hpa: {
    type: Number,
    default: 0,
  },
  mandatory_fitments: {
    type: Number,
    required: true,
  },
  accessories: {
    type: Number,
    required: true,
  },
});

const pricingSchema = new mongoose.Schema({
  breakdown: pricingBreakdownSchema,
  total: {
    type: Number,
    required: true,
  },
  difference: {
    type: Number,
  },
});

const accessorySchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Accessory',
  },
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  type: {
    type: String,
    enum: ['mandatory', 'optional'],
    default: 'optional',
  },
  image: {
    type: String,
  },
  description: {
    type: String,
  },
});

const selectedModelSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Model',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    default: 'selected',
  },
  image_url: {
    type: String,
  },
  technical_specs: technicalSpecsSchema,
  color_options: {
    type: [String],
    default: [],
  },
  pricing: pricingSchema,
  accessories: {
    type: [accessorySchema],
    default: [],
  },
});

const comparisonModelSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Model',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  image_url: {
    type: String,
  },
  technical_specs: technicalSpecsSchema,
  color_options: {
    type: [String],
    default: [],
  },
  pricing: pricingSchema,
  accessories: {
    type: [accessorySchema],
    default: [],
  },
});

const metaSchema = new mongoose.Schema({
  quotation_date: {
    type: String,
    required: true,
  },
  expiry_date: {
    type: String,
    required: true,
  },
  branch: {
    type: String,
    required: true,
  },
  sales_person: {
    type: String,
    required: true,
  },
  branch_mobile: {
    type: String,
  },
  gst_number: {
    type: String,
  },
  branch_address: {
    type: String,
  },
});

const quotationSchema = new mongoose.Schema(
  {
    quotation_number: {
      type: String,
      required: true,
      unique: true,
    },
    date: {
      type: String,
      required: true,
    },
    customer_details: {
      type: customerDetailsSchema,
      required: true,
    },
    selected_model: {
      type: selectedModelSchema,
      required: true,
    },
    comparison_models: {
      best_value: comparisonModelSchema,
      top_model: comparisonModelSchema,
    },
    meta: {
      type: metaSchema,
      required: true,
    },
    finance_required: {
      type: Boolean,
      default: false,
    },
    test_ride_requested: {
      type: Boolean,
      default: false,
    },
    expected_delivery_date: {
      type: Date,
    },
    branch_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
quotationSchema.index({ quotation_number: 1 });
quotationSchema.index({ 'customer_details.name': 1, 'customer_details.primary_mobile': 1 });
quotationSchema.index({ branch_id: 1 });

quotationSchema.pre('save', function (next) {
  logger.info(`Saving quotation: ${this.quotation_number}`);
  next();
});

const Quotation = mongoose.model('Quotation', quotationSchema);

module.exports = Quotation;