const express = require('express');
const router = express.Router();
const attachmentController = require('../controllers/attachmentController');
const { protect } = require('../middlewares/auth');

// Public route for WhatsApp sharing
router.get('/whatsapp/:id', attachmentController.generateWhatsAppLink);

// Protected route for direct WhatsApp sending
router.post('/whatsapp/share', protect, attachmentController.shareOnWhatsApp);

// Protected routes
router.use(protect);
router.post('/', attachmentController.uploadAttachmentFile, attachmentController.createAttachment);
router.get('/model/:modelId', attachmentController.getAttachmentsForModel);
router.get('/', attachmentController.getAllAttachments);
router.get('/:id', attachmentController.getAttachmentById);
router.put('/:id', attachmentController.updateAttachment);
router.delete('/:id', attachmentController.deleteAttachment);

module.exports = router;