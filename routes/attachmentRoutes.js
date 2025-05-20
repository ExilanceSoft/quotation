const express = require('express');
const router = express.Router();
const attachmentController = require('../controllers/attachmentController');
const { protect } = require('../middlewares/auth');

router.use(protect);

router.post(
  '/',
  attachmentController.uploadAttachmentFile,
  attachmentController.createAttachment
);

router.get('/model/:modelId', attachmentController.getAttachmentsForModel);
router.get('/', attachmentController.getAllAttachments);
router.get('/:id', attachmentController.getAttachmentById);
router.put('/:id', attachmentController.updateAttachment);
router.delete('/:id', attachmentController.deleteAttachment);
router.get('/:id/whatsapp', attachmentController.generateWhatsAppLink);

module.exports = router;
