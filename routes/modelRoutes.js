const express = require('express');
const router = express.Router();
const modelController = require('../controllers/modelController');
const { protect, authorize } = require('../middleware/auth');

router
  .route('/')
  .get(modelController.getModels)
  .post(protect, authorize('admin'), modelController.createModel);

router
  .route('/:id')
  .get(modelController.getModel)
  .put(protect, authorize('admin'), modelController.updateModel)
  .delete(protect, authorize('admin'), modelController.deleteModel);

module.exports = router;