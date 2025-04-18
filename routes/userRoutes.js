const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

router.post('/register', userController.register);
router.post('/login', userController.login);

router
  .route('/me')
  .get(protect, userController.getCurrentUser)
  .put(protect, userController.updateCurrentUser);

router
  .route('/')
  .get(protect, authorize('admin'), userController.getUsers);

router
  .route('/:id')
  .get(protect, authorize('admin'), userController.getUser)
  .put(protect, authorize('admin'), userController.updateUser)
  .delete(protect, authorize('admin'), userController.deleteUser);

module.exports = router;