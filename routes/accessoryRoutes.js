const express = require('express');
const router = express.Router();
const accessoryController = require('../controllers/accesoriesController');
const { protect, authorize } = require('../middlewares/auth');
router
  .route('/')
  .get(accessoryController.getAccessories)
  .post(protect, authorize('admin'), accessoryController.createAccessory);
router
  .route('/:id')
  .get(accessoryController.getAccessory)
  .put(protect, authorize('admin'), accessoryController.updateAccessory)
  .delete(protect, authorize('admin'), accessoryController.deleteAccessory);

router.patch(
  '/:id/toggle-active',
  protect,
  authorize('admin'),
  accessoryController.toggleActive
);

module.exports = router;