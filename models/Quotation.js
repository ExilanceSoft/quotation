const mongoose = require('mongoose');
const logger = require('../config/logger');

// Customer Details Schema
const customerDetailsSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  address: {
    type: String,
    trim: true,
    maxlength: [200, 'Address cannot exceed 200 characters']
  },
  primary_mobile: {
    type: String,
    required: [true, 'Primary mobile number is required'],
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit mobile number'],
    trim: true
  },
  secondary_mobile: {
    type: String,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit mobile number'],
    trim: true
  },
  taluka: {
    type: String,
    trim: true,
    maxlength: [50, 'Taluka cannot exceed 50 characters']
  },
  district: {
    type: String,
    trim: true,
    maxlength: [50, 'District cannot exceed 50 characters']
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  }
});

// Technical Specifications Schema
const technicalSpecsSchema = new mongoose.Schema({
  engine_cc: {
    type: Number,
    min: [0, 'Engine CC cannot be negative']
  },
  fuel_type: {
    type: String,
    enum: {
      values: ['petrol', 'diesel', 'electric', 'hybrid', 'cng'],
      message: 'Invalid fuel type'
    }
  },
  gearbox: {
    type: String,
    enum: {
      values: ['manual', 'automatic', 'semi-automatic', 'cvt'],
      message: 'Invalid gearbox type'
    }
  }
});

// Pricing Breakdown Schema
const pricingBreakdownSchema = new mongoose.Schema({
  ex_showroom: {
    type: Number,
    required: [true, 'Ex-showroom price is required'],
    min: [0, 'Price cannot be negative']
  },
  rto_tax: {
    type: Number,
    required: [true, 'RTO tax is required'],
    min: [0, 'RTO tax cannot be negative']
  },
  insurance: {
    type: Number,
    required: [true, 'Insurance amount is required'],
    min: [0, 'Insurance amount cannot be negative']
  },
  pdi_handling: {
    type: Number,
    required: [true, 'PDI handling charges are required'],
    min: [0, 'PDI handling charges cannot be negative']
  },
  hpa: {
    type: Number,
    default: 0,
    min: [0, 'HPA cannot be negative']
  },
  mandatory_fitments: {
    type: Number,
    required: [true, 'Mandatory fitments amount is required'],
    min: [0, 'Mandatory fitments amount cannot be negative']
  },
  accessories: {
    type: Number,
    required: [true, 'Accessories amount is required'],
    min: [0, 'Accessories amount cannot be negative']
  }
});

// Pricing Schema
const pricingSchema = new mongoose.Schema({
  breakdown: {
    type: pricingBreakdownSchema,
    required: [true, 'Pricing breakdown is required']
  },
  total: {
    type: Number,
    required: [true, 'Total price is required'],
    min: [0, 'Total price cannot be negative']
  },
  difference: {
    type: Number
  }
});

// Accessory Schema
const accessorySchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Accessory',
    required: [true, 'Accessory ID is required']
  },
  name: {
    type: String,
    required: [true, 'Accessory name is required'],
    trim: true,
    maxlength: [100, 'Accessory name cannot exceed 100 characters']
  },
  price: {
    type: Number,
    required: [true, 'Accessory price is required'],
    min: [0, 'Accessory price cannot be negative']
  },
  type: {
    type: String,
    enum: {
      values: ['mandatory', 'optional'],
      message: 'Accessory type must be either mandatory or optional'
    },
    default: 'optional'
  },
  image: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  }
});

// Selected Model Schema
const selectedModelSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Model',
    required: [true, 'Model ID is required']
  },
  name: {
    type: String,
    required: [true, 'Model name is required'],
    trim: true,
    maxlength: [100, 'Model name cannot exceed 100 characters']
  },
  type: {
    type: String,
    default: 'selected'
  },
  image_url: {
    type: String,
    trim: true
  },
  technical_specs: technicalSpecsSchema,
  color_options: {
    type: [String],
    default: [],
    validate: {
      validator: function(v) {
        return v.every(color => color.length <= 30);
      },
      message: 'Color options cannot exceed 30 characters each'
    }
  },
  pricing: {
    type: pricingSchema,
    required: [true, 'Pricing information is required']
  },
  accessories: {
    type: [accessorySchema],
    default: []
  }
});

// Comparison Model Schema
const comparisonModelSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Model',
    required: [true, 'Comparison model ID is required']
  },
  name: {
    type: String,
    required: [true, 'Comparison model name is required'],
    trim: true,
    maxlength: [100, 'Model name cannot exceed 100 characters']
  },
  type: {
    type: String,
    required: [true, 'Comparison model type is required']
  },
  image_url: {
    type: String,
    trim: true
  },
  technical_specs: technicalSpecsSchema,
  color_options: {
    type: [String],
    default: [],
    validate: {
      validator: function(v) {
        return v.every(color => color.length <= 30);
      },
      message: 'Color options cannot exceed 30 characters each'
    }
  },
  pricing: pricingSchema,
  accessories: {
    type: [accessorySchema],
    default: []
  }
});

// Meta Information Schema
const metaSchema = new mongoose.Schema({
  quotation_date: {
    type: String,
    required: [true, 'Quotation date is required'],
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format']
  },
  expiry_date: {
    type: String,
    required: [true, 'Expiry date is required'],
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format']
  },
  branch: {
    type: String,
    required: [true, 'Branch name is required'],
    trim: true,
    maxlength: [100, 'Branch name cannot exceed 100 characters']
  },
  sales_person: {
    type: String,
    required: [true, 'Sales person name is required'],
    trim: true,
    maxlength: [100, 'Sales person name cannot exceed 100 characters']
  },
  branch_mobile: {
    type: String,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit mobile number'],
    trim: true
  },
  gst_number: {
    type: String,
    trim: true,
    match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Please enter a valid GST number']
  },
  branch_address: {
    type: String,
    trim: true,
    maxlength: [200, 'Branch address cannot exceed 200 characters']
  }
});

// Main Quotation Schema
const quotationSchema = new mongoose.Schema(
  {
    quotation_number: {
      type: String,
      required: [true, 'Quotation number is required'],
      unique: true,
      trim: true,
      maxlength: [50, 'Quotation number cannot exceed 50 characters'],
      index: true // Removed the duplicate index definition from below
    },
    date: {
      type: String,
      required: [true, 'Quotation creation date is required'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format']
    },
    customer_details: {
      type: customerDetailsSchema,
      required: [true, 'Customer details are required']
    },
    selected_model: {
      type: selectedModelSchema,
      required: [true, 'Selected model details are required']
    },
    comparison_models: {
      best_value: comparisonModelSchema,
      top_model: comparisonModelSchema
    },
    meta: {
      type: metaSchema,
      required: [true, 'Meta information is required']
    },
    finance_required: {
      type: Boolean,
      default: false
    },
    test_ride_requested: {
      type: Boolean,
      default: false
    },
    expected_delivery_date: {
      type: Date
    },
    branch_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch ID is required']
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator user ID is required']
    }
  },
  {
    timestamps: true,
    toJSON: { 
      virtuals: true,
      transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    },
    toObject: { 
      virtuals: true,
      transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Indexes - Removed the duplicate quotation_number index since it's now defined in the schema
quotationSchema.index({ 
  'customer_details.name': 'text',
  'customer_details.primary_mobile': 1 
});
quotationSchema.index({ branch_id: 1 });
quotationSchema.index({ createdAt: -1 });

// Add a pre-save hook to validate the total price matches the breakdown
quotationSchema.pre('save', function(next) {
  if (this.selected_model && this.selected_model.pricing && this.selected_model.pricing.breakdown) {
    const breakdown = this.selected_model.pricing.breakdown;
    const calculatedTotal = 
      breakdown.ex_showroom +
      breakdown.rto_tax +
      breakdown.insurance +
      breakdown.pdi_handling +
      breakdown.hpa +
      breakdown.mandatory_fitments +
      breakdown.accessories;
    
    if (this.selected_model.pricing.total !== calculatedTotal) {
      logger.warn(`Quotation ${this.quotation_number} has inconsistent pricing. Calculated: ${calculatedTotal}, Stored: ${this.selected_model.pricing.total}`);
    }
  }
  
  logger.info(`Saving quotation: ${this.quotation_number}`);
  next();
});

const Quotation = mongoose.model('Quotation', quotationSchema);

module.exports = Quotation;