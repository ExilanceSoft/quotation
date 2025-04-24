const mongoose = require('mongoose');
const logger = require('../config/logger');

const modelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a model name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  model_group: {
    type: String,
    required: [true, 'Please add a model group'],
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  branch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  engine_cc: {
    type: Number,
    min: [0, 'Engine CC must be at least 0']
  },
  fuel_type: {
    type: String,
    enum: ['Petrol', 'Diesel', 'Electric', 'CNG', 'Hybrid'],
    default: 'Petrol'
  },
  gearbox: {
    type: String,
    enum: ['Manual', 'Automatic', 'CVT', 'DCT'],
    default: 'Manual'
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    caption: {
      type: String,
      default: ''
    },
    is_primary: {
      type: Boolean,
      default: false
    }
  }],
  ex_showroom_price: {
    type: Number,
    required: [true, 'Please add an ex-showroom price'],
    min: [0, 'Price must be at least 0']
  },
  rto_tax_percentage: {
    type: Number,
    required: [true, 'Please add RTO tax percentage'],
    min: [0, 'Tax percentage must be at least 0'],
    max: [100, 'Tax percentage cannot exceed 100']
  },
  default_insurance: {
    type: Number,
    required: [true, 'Please add default insurance amount'],
    min: [0, 'Insurance amount must be at least 0']
  },
  pdi_handling: {
    type: Number,
    default: 1000.0,
    min: [0, 'PDI handling must be at least 0']
  },
  hpa_charges: {
    type: Number,
    default: 500.0,
    min: [0, 'HPA charges must be at least 0']
  },
  mandatory_fitments: {
    type: Number,
    default: 0.0,
    min: [0, 'Mandatory fitments must be at least 0']
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

modelSchema.virtual('on_road_price').get(function() {
  const rtoTax = (this.ex_showroom_price * this.rto_tax_percentage) / 100;
  return (
    this.ex_showroom_price +
    rtoTax +
    this.default_insurance +
    this.pdi_handling +
    this.hpa_charges +
    this.mandatory_fitments
  );
});

modelSchema.index({ model_group: 1 });
modelSchema.index({ fuel_type: 1, gearbox: 1 });
modelSchema.index({ is_active: 1, ex_showroom_price: 1 });
modelSchema.index({ branch_id: 1 });

modelSchema.pre('save', function(next) {
  logger.info(`Saving model: ${this.name}`);
  next();
});

module.exports = mongoose.model('Model', modelSchema);