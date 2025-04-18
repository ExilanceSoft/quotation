const express = require('express');
const router = express.Router();
const accessoryController = require('../controllers/accessoryController');
const { protect, authorize } = require('../middleware/auth');

router
  .route('/')
  .get(accessoryController.getAccessories)
  .post(protect, authorize('admin'), accessoryController.createAccessory);

router
  .route('/:id')
  .get(accessoryController.getAccessory)
  .put(protect, authorize('admin'), accessoryController.updateAccessory)
  .delete(protect, authorize('admin'), accessoryController.deleteAccessory);

module.exports = router;