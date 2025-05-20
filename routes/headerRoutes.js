const express = require('express');
const router = express.Router();
const headerController = require('../controllers/headerController');
const { protect } = require('../middlewares/auth');

router.post('/', protect, headerController.createHeader);

router.get('/', headerController.getAllHeaders);

router.patch('/bulk-priorities', protect, headerController.updateHeaderPriorities);

router.get('/id/:id', headerController.getHeaderById);

router.patch('/:id', protect, headerController.updateHeader);

router.delete('/:id', protect, headerController.deleteHeader);

module.exports = router;