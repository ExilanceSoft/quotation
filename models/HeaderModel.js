const mongoose = require('mongoose');

const headerSchema = new mongoose.Schema({
  category_key: {
    type: String,
    required: [true, 'Category key is required'],
    trim: true
  },
  type: {
    type: String,
    required: [true, 'Type is required'],
    enum: ['EV', 'IC'],
    uppercase: true,
    trim: true
  },
  header_key: {
    type: String,
    required: [true, 'Header key is required'],
    trim: true
  },
  priority: {
    type: Number,
    required: [true, 'Priority is required'],
    min: [1, 'Priority must be at least 1']
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
headerSchema.index({ type: 1, category_key: 1, priority: 1 }, { unique: true });
headerSchema.index({ type: 1, category_key: 1, header_key: 1 }, { unique: true });
headerSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('header_key') || this.isModified('priority') || this.isModified('type') || this.isModified('category_key')) {
    const existingHeader = await this.constructor.findOne({
      type: this.type,
      category_key: this.category_key,
      header_key: this.header_key
    });
    
    if (existingHeader && (!this.isNew || existingHeader._id.toString() !== this._id.toString())) {
      throw new Error(
        `Header with type '${this.type}', category '${this.category_key}', ` +
        `and header_key '${this.header_key}' already exists`
      );
    }
  }
  next();
});
const Header = mongoose.model('Header', headerSchema);

module.exports = Header;