// modelRoutes.js
const express = require('express');
const router = express.Router();
const modelController = require('../controllers/modelController');
const { protect } = require('../middlewares/auth');

// MODEL CRUD ENDPOINTS
// ===================

// 1. Create a new model
router.post('/', protect, modelController.createModel);

// 2. Get all models (basic info)
// router.get('/', modelController.getAllModels);
 router.get('/', protect, modelController.getAllModels);
 //get with all status
router.get('/status', protect, modelController.getAllModelsStatus);


// 3. Get model by ID (basic info)
router.get('/:modelId', modelController.getModelDetails);

// 4. Update model basic info
router.patch('/:modelId', protect, modelController.updateModel);

// 5. Delete model
router.delete('/:modelId', protect, modelController.deleteModel);

//6.Change Status 
router.patch('/:modelId/status', protect, modelController.updateModelStatus);

// PRICE-RELATED ENDPOINTS
// =======================

// 6. Get all models with prices (can filter by branch_id)
router.get('/all/with-prices', modelController.getAllModelsWithPrices);

// 7. Get specific model with prices (can filter by branch_id)
router.get('/:modelId/with-prices', modelController.getModelWithPrices);

// 8. Update model prices
router.patch('/:modelId/prices', protect, modelController.updateModelPrices);

// BASE MODEL ENDPOINTS
// ====================

// 9. Identify base models (lowest price in each series)
router.get('/base-models', modelController.identifyBaseModels);

// 10. Get base model for selected models
router.post('/base-model-for-selected', modelController.getBaseModelForSelectedModels);

// UTILITY ENDPOINTS

// 11. Get model by ID (alternative endpoint)
router.get('/id/:modelId', modelController.getModelById);

module.exports = router;