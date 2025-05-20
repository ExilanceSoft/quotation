const Attachment = require('../models/AttachmentModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads/attachments');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `attch-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
}).fields([
  { name: 'images', maxCount: 10 },
  { name: 'videos', maxCount: 5 },
  { name: 'documents', maxCount: 5 }
]);

exports.uploadAttachmentFile = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        status: 'error',
        message: err.message || 'File upload failed'
      });
    }
    next();
  });
};

exports.createAttachment = async (req, res) => {
  try {
    const applicableModels = req.body.applicableModels ? JSON.parse(req.body.applicableModels) : [];
    const youtubeUrls = req.body.youtubeUrls ? JSON.parse(req.body.youtubeUrls) : [];
    const textContents = req.body.textContents ? JSON.parse(req.body.textContents) : [];

    const isForAllModels = req.body.isForAllModels === 'true' || req.body.isForAllModels === true;

    const attachmentData = {
      title: req.body.title,
      description: req.body.description,
      isForAllModels: isForAllModels,
      createdBy: req.user._id,
      attachments: []
    };

    if (!isForAllModels) {
      attachmentData.applicableModels = applicableModels;
    }

    if (req.files?.images) {
      req.files.images.forEach(file => {
        attachmentData.attachments.push({
          type: 'image',
          url: `/uploads/attachments/${file.filename}`
        });
      });
    }

    if (req.files?.videos) {
      req.files.videos.forEach(file => {
        attachmentData.attachments.push({
          type: 'video',
          url: `/uploads/attachments/${file.filename}`
        });
      });
    }

    if (req.files?.documents) {
      req.files.documents.forEach(file => {
        attachmentData.attachments.push({
          type: 'document',
          url: `/uploads/attachments/${file.filename}`
        });
      });
    }

    youtubeUrls.forEach(url => {
      if (url) {
        const videoId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|youtu\.be\/)([^"&?\/\s]{11}))/i);
        attachmentData.attachments.push({
          type: 'youtube',
          url,
          thumbnail: videoId ? `https://img.youtube.com/vi/${videoId[1]}/0.jpg` : null
        });
      }
    });

    textContents.forEach(text => {
      if (text) {
        attachmentData.attachments.push({
          type: 'text',
          content: text
        });
      }
    });

    const attachment = await Attachment.create(attachmentData);
    
    res.status(201).json({
      status: 'success',
      data: { attachment }
    });
  } catch (err) {
    res.status(400).json({
      status: 'error',
      message: err.message
    });
  }
};

exports.getAttachmentsForModel = async (req, res) => {
  try {
    const { modelId } = req.params;
    const attachments = await Attachment.find({
      $or: [
        { isForAllModels: true },
        { applicableModels: modelId }
      ]
    }).populate('createdBy', 'name email');

    res.status(200).json({
      status: 'success',
      data: { attachments }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};

exports.getAllAttachments = async (req, res) => {
  try {
    const attachments = await Attachment.find().populate('createdBy', 'name email');
    res.status(200).json({
      status: 'success',
      data: { attachments }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};

exports.deleteAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const attachment = await Attachment.findById(id);
    
    if (!attachment) {
      return res.status(404).json({
        status: 'error',
        message: 'Attachment not found'
      });
    }

    attachment.attachments.forEach(item => {
      if (item.type !== 'youtube' && item.type !== 'text' && item.url) {
        const filePath = path.join(__dirname, '../public', item.url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });

    await Attachment.findByIdAndDelete(id);
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};

exports.generateWhatsAppLink = async (req, res) => {
  try {
    const { id } = req.params;
    const attachment = await Attachment.findById(id);
    
    if (!attachment) {
      return res.status(404).json({
        status: 'error',
        message: 'Attachment not found'
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const shareUrl = `${baseUrl}/attachments/${id}`;
    const whatsappLink = `https://wa.me/?text=Check out this attachment: ${encodeURIComponent(shareUrl)}`;
    
    res.status(200).json({
      status: 'success',
      data: { whatsappLink }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};
exports.getAttachmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const attachment = await Attachment.findById(id).populate('createdBy', 'name email');

    if (!attachment) {
      return res.status(404).json({
        status: 'error',
        message: 'Attachment not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { attachment },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};
exports.updateAttachment = async (req, res) => {
  try {
    const { id } = req.params;

    // First handle the file upload
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          status: 'error',
          message: err.message || 'File upload failed'
        });
      }

      try {
        // Fetch the existing attachment document
        const existingAttachment = await Attachment.findById(id);
        if (!existingAttachment) {
          return res.status(404).json({
            status: 'error',
            message: 'Attachment not found',
          });
        }

        // Parse the form data
        const applicableModels = req.body.applicableModels ? JSON.parse(req.body.applicableModels) : existingAttachment.applicableModels;
        const youtubeUrls = req.body.youtubeUrls ? JSON.parse(req.body.youtubeUrls) : [];
        const textContents = req.body.textContents ? JSON.parse(req.body.textContents) : [];
        const isForAllModels = req.body.isForAllModels === 'true' || req.body.isForAllModels === true || false;

        // Initialize update data
        const updateData = {
          title: req.body.title || existingAttachment.title,
          description: req.body.description || existingAttachment.description,
          isForAllModels: isForAllModels,
          applicableModels: isForAllModels ? [] : applicableModels,
          attachments: [...existingAttachment.attachments], // clone existing attachments
        };

        // Handle new file uploads
        if (req.files?.images) {
          req.files.images.forEach(file => {
            updateData.attachments.push({
              type: 'image',
              url: `/uploads/attachments/${file.filename}`
            });
          });
        }

        if (req.files?.videos) {
          req.files.videos.forEach(file => {
            updateData.attachments.push({
              type: 'video',
              url: `/uploads/attachments/${file.filename}`
            });
          });
        }

        if (req.files?.documents) {
          req.files.documents.forEach(file => {
            updateData.attachments.push({
              type: 'document',
              url: `/uploads/attachments/${file.filename}`
            });
          });
        }

        // Append new text contents
        textContents.forEach(text => {
          if (text) {
            updateData.attachments.push({
              type: 'text',
              content: text
            });
          }
        });

        // Append new YouTube URLs
        youtubeUrls.forEach(url => {
          if (url) {
            const videoId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|youtu\.be\/)([^"&?\/\s]{11}))/i);
            updateData.attachments.push({
              type: 'youtube',
              url,
              thumbnail: videoId ? `https://img.youtube.com/vi/${videoId[1]}/0.jpg` : null
            });
          }
        });

        // Save the updated document
        const updated = await Attachment.findByIdAndUpdate(id, updateData, { new: true });

        res.status(200).json({
          status: 'success',
          data: { attachment: updated },
        });
      } catch (err) {
        res.status(400).json({
          status: 'error',
          message: err.message,
        });
      }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};
