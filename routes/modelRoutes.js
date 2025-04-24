const express = require('express');
const router = express.Router();
const modelController = require('../controllers/modelController');
const { protect, authorize } = require('../middlewares/auth');
const upload = require('../utils/fileUpload');

router
  .route('/')
  .get(modelController.getModels)
  .post(
    protect,
    authorize(['admin', 'super_admin'], 'model', 'create'),
    upload.single('image'), // Add image upload to create endpoint
    modelController.createModel
  );

router
  .route('/:id')
  .get(modelController.getModel)
  .put(
    protect,
    authorize(['admin', 'super_admin'], 'model', 'update'),
    upload.single('image'), // Add image upload to update endpoint
    modelController.updateModel
  )
  .delete(
    protect,
    authorize(['admin', 'super_admin'], 'model', 'delete'),
    modelController.deleteModel
  );

router.get('/group/:group', modelController.getModelsByGroup);

module.exports = router;