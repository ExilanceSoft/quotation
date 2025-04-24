const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { protect, authorize } = require('../middlewares/auth');

// Protect all routes
router.use(protect);

// Only super_admin can create, update, delete branches
// All authenticated users can view branches
router
  .route('/')
  .get(branchController.getBranches)
  .post(authorize(['super_admin'], 'branch', 'create'), branchController.createBranch);

router
  .route('/:id')
  .get(branchController.getBranch)
  .put(authorize(['super_admin'], 'branch', 'update'), branchController.updateBranch)
  .delete(authorize(['super_admin'], 'branch', 'delete'), branchController.deleteBranch);

module.exports = router;