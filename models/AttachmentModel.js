const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  title: String,
  description: String,
  attachments: [{
    type: { 
      type: String,
      enum: ['image', 'video', 'youtube', 'document', 'text'],
      required: true
    },
    url: String,
    content: String,
    thumbnail: String
  }],
  isForAllModels: {
    type: Boolean,
    default: true
  },
  applicableModels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Model'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true } 
});

module.exports = mongoose.model('Attachment', attachmentSchema);