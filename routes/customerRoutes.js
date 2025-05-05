const express = require('express');
const customerController = require('../controllers/customerController');
const auth = require('../middlewares/auth');

const router = express.Router();

// Protect all routes after this middleware
router.use(auth.protect);

router
  .route('/')
  .post(
    auth.authorize([], 'customer', 'create'),
    customerController.createCustomer
  )
  .get(
    auth.authorize([], 'customer', 'read'),
    customerController.getAllCustomers
  );

router
  .route('/:id')
  .get(
    auth.authorize([], 'customer', 'read'),
    customerController.getCustomer
  )
  .patch(
    auth.authorize([], 'customer', 'update'),
    customerController.updateCustomer
  )
  .delete(
    auth.authorize(['admin'], 'customer', 'delete'),
    customerController.deleteCustomer
  );

module.exports = router;