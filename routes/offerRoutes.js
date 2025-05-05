const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const { protect } = require('../middlewares/auth');

// Create a new offer (with image upload)
router.post(
  '/', 
  protect, 
  offerController.uploadOfferImage, 
  offerController.createOffer
);

router.get('/', offerController.getAllOffers);

router.get('/:id', offerController.getOfferById);

router.patch(
  '/:id', 
  protect, 
  offerController.uploadOfferImage, 
  offerController.updateOffer
);

router.delete('/:id', protect, offerController.deleteOffer);

router.get('/for-model/:modelId', offerController.getOffersForModel);

module.exports = router;