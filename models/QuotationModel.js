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
  prices: [{
    value: {
      type: Number,
      required: true
    },
    header_key: String,
    category_key: String,
    priority: Number,
    metadata: mongoose.Schema.Types.Mixed,
    branch_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch'
    }
  }],
  ex_showroom_price: Number,
  series: String,
  is_base_model: Boolean,
  offers: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    title: String,
    description: String,
    image: String,
    url: String,
    createdAt: Date
  }]
}, { _id: false });

const attachmentItemSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['image', 'document', 'video', 'youtube', 'text', 'other'], // Added 'youtube' and 'text'
    required: true
  },
  url: {
    type: String,
    required: true
  },
  content: String,
  thumbnail: String
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  title: String,
  description: String,
  isForAllModels: Boolean,
  applicableModels: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Model',
      required: true
    },
    model_name: String
  }],
  attachments: [attachmentItemSchema],
  createdBy: {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: String,
    email: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const offerSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  title: String,
  description: String,
  image: String,
  url: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  applyToAllModels: Boolean,
  applicableModels: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Model',
      required: true
    },
    model_name: String
  }]
}, { _id: false });

const financeDocumentSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  isRequired: {
    type: Boolean,
    default: false
  },
  description: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const termsConditionSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  order: Number
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
  customerDetails: {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    address: String,
    taluka: String,
    district: String,
    mobile1: {
      type: String,
      required: true
    },
    mobile2: String,
    finance_needed: Boolean,
    createdAt: {
      type: Date,
      default: Date.now
    }
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
  userDetails: {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    username: String,
    email: String,
    mobile: String,
    full_name: String,
    branch: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      name: String,
      address: String,
      city: String,
      state: String,
      pincode: String,
      phone: String,
      email: String,
      gst_number: String,
      is_active: Boolean
    },
    role: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      name: String
    }
  },
  AllModels: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    model_name: String,
    prices: [{
      value: Number,
      header_key: String,
      category_key: String,
      priority: Number,
      metadata: mongoose.Schema.Types.Mixed,
      branch_id: mongoose.Schema.Types.ObjectId
    }],
    ex_showroom_price: Number,
    series: String,
    createdAt: Date,
    is_base_model: Boolean
  }],
  financeDocuments: [financeDocumentSchema],
  termsConditions: [termsConditionSchema],
  attachments: [attachmentSchema],
  modelSpecificOffers: [{
    model_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Model',
      required: true
    },
    model_name: String,
    offers: [{
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      title: String,
      description: String,
      image: String,
      url: String,
      createdAt: Date
    }]
  }],
  allUniqueOffers: [offerSchema],
  notes: String,
  pdfUrl: String
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals
quotationSchema.virtual('customer', {
  ref: 'Customer',
  localField: 'customer_id',
  foreignField: '_id',
  justOne: true
});

quotationSchema.virtual('creator', {
  ref: 'User',
  localField: 'createdBy',
  foreignField: '_id',
  justOne: true
});

quotationSchema.pre('save', async function(next) {
  if (!this.quotation_number) {
    const count = await this.constructor.countDocuments();
    this.quotation_number = `QT-${Date.now()}-${count + 1}`;
  }
  next();
});

const Quotation = mongoose.model('Quotation', quotationSchema);

module.exports = Quotation;