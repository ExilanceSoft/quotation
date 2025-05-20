const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, authorize } = require('../middlewares/auth');

// Public routes
router.post('/register-super-admin', userController.registerSuperAdmin);
router.post('/login', userController.login);
router.post('/verify-otp', userController.verifyOTP);


// Protected routes below
router.use(protect);


router
  .route('/me')
  .get(userController.getCurrentUser)
  .put(userController.updateCurrentUser);

// Admin routes (require user read permission)
router.use(authorize('user', 'read'));

router.post('/register', userController.register);

router
  .route('/')
  .get(userController.getUsers);

router
  .route('/:id')
  .get(userController.getUser)
  .put(userController.updateUser)
  .delete(authorize('user', 'delete'), userController.deleteUser);

router.patch('/:id/toggle-active', authorize('user', 'update'), userController.toggleActive);

module.exports = router;