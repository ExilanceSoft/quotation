const Attachment = require('../models/AttachmentModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Quotation = require('../models/QuotationModel');


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
const axios = require('axios');

const Customer = require('../models/CustomerModel');
const AppError = require('../utils/appError');
const logger = require('../config/logger');

// Helper function to format WhatsApp message
const formatWhatsAppMessage = (quotation, selectedAttachments = []) => {
  let message = `📄 *Quotation Details* 📄\n\n`;
  message += `🔹 *Quotation Number:* ${quotation.quotation_number}\n`;
  message += `🔹 *Customer:* ${quotation.customerDetails.name}\n`;
  message += `🔹 *Date:* ${new Date(quotation.createdAt).toLocaleDateString()}\n\n`;
  
  // Add PDF link
  if (quotation.pdfUrl) {
    message += `📎 *PDF Document:* ${quotation.pdfUrl}\n\n`;
  }

  // Add selected attachments
  if (selectedAttachments.length > 0) {
    message += `📌 *Attachments:*\n`;
    quotation.attachments.forEach(attachment => {
      if (selectedAttachments.includes(attachment._id.toString())) {
        message += `\n🔸 *${attachment.title}*`;
        if (attachment.description) message += ` - ${attachment.description}\n`;
        
        attachment.attachments.forEach(item => {
          switch(item.type) {
            case 'image': message += `🖼️ ${item.url}\n`; break;
            case 'video': message += `🎬 ${item.url}\n`; break;
            case 'document': message += `📄 ${item.url}\n`; break;
            case 'youtube': message += `▶️ ${item.url}\n`; break;
            case 'text': message += `📝 ${item.content}\n`; break;
          }
        });
      }
    });
  }

  return message;
};

exports.generateWhatsAppLink = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return next(new AppError('Quotation ID is required', 400));
    }

    const quotation = await Quotation.findById(id)
      .populate('customer', 'mobile1 mobile2')
      .populate('attachments');

    if (!quotation) {
      return next(new AppError('Quotation not found', 404));
    }

    const numbers = [];
    if (quotation.customer?.mobile1) {
      numbers.push(quotation.customer.mobile1.replace(/\D/g, ''));
    }
    if (quotation.customer?.mobile2) {
      numbers.push(quotation.customer.mobile2.replace(/\D/g, ''));
    }

    const formattedAttachments = quotation.attachments.map(attachment => ({
      id: attachment._id.toString(),
      title: attachment.title,
      description: attachment.description,
      items: attachment.attachments.map(item => ({
        type: item.type,
        url: item.url,
        content: item.content,
        thumbnail: item.thumbnail
      }))
    }));

    const response = {
      status: 'success',
      data: {
        quotationNumber: quotation.quotation_number,
        pdfUrl: quotation.pdfUrl ? `${req.protocol}://${req.get('host')}${quotation.pdfUrl}` : null,
        attachments: formattedAttachments,
        numbers: numbers.filter(n => n.length >= 10)
      }
    };

    res.status(200).json(response);
  } catch (err) {
    logger.error(`Error generating WhatsApp link: ${err.message}`);
    next(err);
  }
};

exports.shareOnWhatsApp = async (req, res, next) => {
  try {
    const { quotationId, phoneNumber, attachmentIds = [] } = req.body;

    // Validate inputs
    if (!quotationId || !phoneNumber) {
      return next(new AppError('Quotation ID and phone number are required', 400));
    }

    // Get quotation data
    const quotation = await Quotation.findById(quotationId)
      .populate('customer')
      .populate('attachments');

    if (!quotation) {
      return next(new AppError('Quotation not found', 404));
    }

    // Format phone number (remove non-digits and add country code if missing)
    const formattedNumber = phoneNumber.replace(/\D/g, '');
    if (formattedNumber.length < 10) {
      return next(new AppError('Invalid phone number', 400));
    }
    const whatsappNumber = formattedNumber.startsWith('91') ? formattedNumber : `91${formattedNumber}`;

    // Format message
    const message = formatWhatsAppMessage(quotation, attachmentIds);

    // Send via WhatsApp Business API
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: whatsappNumber,
        type: 'text',
        text: {
          body: message
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_BUSINESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    logger.info(`WhatsApp message sent to ${whatsappNumber} for quotation ${quotationId}`);

    res.status(200).json({
      status: 'success',
      data: {
        messageId: response.data.messages[0].id,
        timestamp: response.data.messages[0].timestamp
      }
    });

  } catch (err) {
    logger.error(`Error sending WhatsApp message: ${err.message}`);
    
    // Handle WhatsApp API errors
    if (err.response) {
      return next(new AppError(
        `WhatsApp API error: ${err.response.data.error?.message || 'Failed to send message'}`,
        err.response.status
      ));
    }
    
    next(err);
  }
};
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
    // Get all attachments and populate both createdBy and applicableModels
    const attachments = await Attachment.find()
      .populate('createdBy', 'name email')
      .populate('applicableModels', 'model_name');

    // Format the response to include model names
    const formattedAttachments = attachments.map(attachment => ({
      _id: attachment._id,
      title: attachment.title,
      description: attachment.description,
      isForAllModels: attachment.isForAllModels,
      applicableModels: attachment.isForAllModels 
        ? []
        : attachment.applicableModels.map(model => ({
            _id: model._id,
            model_name: model.model_name
          })),
      attachments: attachment.attachments.map(item => ({
        type: item.type,
        url: item.url,
        content: item.content,
        thumbnail: item.thumbnail
      })),
      createdBy: {
        _id: attachment.createdBy._id,
        name: attachment.createdBy.name,
        email: attachment.createdBy.email
      },
      createdAt: attachment.createdAt,
      updatedAt: attachment.updatedAt
    }));

    res.status(200).json({
      status: 'success',
      data: { 
        attachments: formattedAttachments 
      }
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
    const quotation = await Quotation.findById(id)
      .populate('customer')
      .populate('models.model_id');
    
    if (!quotation) {
      return res.status(404).json({
        status: 'error',
        message: 'Quotation not found'
      });
    }

    // Get base URL - more reliable method
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    // Get PDF URL - handle cases where pdfUrl might already include base path
    let pdfUrl = quotation.pdfUrl;
    if (pdfUrl && !pdfUrl.startsWith('http')) {
      // Remove any leading slash if present
      if (pdfUrl.startsWith('/')) {
        pdfUrl = pdfUrl.substring(1);
      }
      pdfUrl = `${baseUrl}/${pdfUrl}`;
    }

    // Get applicable attachments
    const modelIds = quotation.models.map(m => m.model_id._id);
    const attachments = await Attachment.find({
      $or: [
        { isForAllModels: true },
        { applicableModels: { $in: modelIds } }
      ]
    });

    // Format attachments for display with checkboxes
    const formattedAttachments = attachments.map(att => ({
      id: att._id,
      title: att.title,
      description: att.description,
      items: att.attachments.map(item => ({
        type: item.type,
        url: item.type === 'youtube' ? item.url : `${baseUrl}${item.url}`,
        content: item.content,
        thumbnail: item.thumbnail
      }))
    }));

    // Get WhatsApp-available mobile numbers
    const whatsappNumbers = [];
    if (quotation.customer?.mobile1) {
      whatsappNumbers.push(quotation.customer.mobile1.replace(/\D/g, ''));
    }
    if (quotation.customer?.mobile2) {
      whatsappNumbers.push(quotation.customer.mobile2.replace(/\D/g, ''));
    }

    // Create WhatsApp share data
    const shareData = {
      pdfUrl: pdfUrl || 'PDF not available',
      attachments: formattedAttachments,
      numbers: whatsappNumbers,
      quotationNumber: quotation.quotation_number
    };

    res.status(200).json({
      status: 'success',
      data: shareData
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
