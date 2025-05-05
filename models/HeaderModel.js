const mongoose = require('mongoose');

const headerSchema = new mongoose.Schema({
  category_key: {
    type: String,
    required: [true, 'Category key is required'],
    trim: true
  },
  header_key: {
    type: String,
    required: [true, 'Header key is required'],
    unique: true,
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

const Header = mongoose.model('Header', headerSchema);

module.exports = Header;