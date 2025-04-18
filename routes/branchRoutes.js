const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { protect, authorize } = require('../middleware/auth');

router
  .route('/')
  .get(branchController.getBranches)
  .post(protect, authorize('admin'), branchController.createBranch);

router
  .route('/:id')
  .get(branchController.getBranch)
  .put(protect, authorize('admin'), branchController.updateBranch)
  .delete(protect, authorize('admin'), branchController.deleteBranch);

module.exports = router;