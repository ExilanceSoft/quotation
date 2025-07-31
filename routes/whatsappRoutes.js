// routes/whatsappRoutes.js
const express = require('express');
const whatsappController = require('../controllers/whatsappController');
const router = express.Router();

router.post('/send-quotation', whatsappController.sendQuotationViaWhatsApp);

module.exports = router;