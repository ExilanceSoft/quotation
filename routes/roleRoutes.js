const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { protect, authorize } = require('../middlewares/auth');

// Protect all routes
router.use(protect);

// Only super admin can create, update, delete roles
// Both admin and super_admin can read roles
router
  .route('/')
  .get(authorize(['admin', 'super_admin'], 'role', 'read'), roleController.getRoles)
  .post(authorize('super_admin', 'role', 'create'), roleController.createRole);

router
  .route('/:id')
  .get(authorize(['admin', 'super_admin'], 'role', 'read'), roleController.getRole)
  .put(authorize('super_admin', 'role', 'update'), roleController.updateRole)
  .delete(authorize('super_admin', 'role', 'delete'), roleController.deleteRole);

router.get('/defaults', authorize(['admin', 'super_admin'], 'role', 'read'), roleController.getDefaultRoles);

module.exports = router;