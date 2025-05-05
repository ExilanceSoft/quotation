const express = require('express');
const router = express.Router();
const headerController = require('../controllers/headerController');
const { protect } = require('../middlewares/auth');

// POST /api/headers
router.post('/', protect, headerController.createHeader);

// GET /api/headers
router.get('/', headerController.getAllHeaders);

// PATCH /api/headers/bulk-priorities (renamed for clarity)
router.patch('/bulk-priorities', protect, headerController.updateHeaderPriorities);

router.get('/id/:id', headerController.getHeaderById);

// PATCH /api/headers/:id
router.patch('/:id', protect, headerController.updateHeader);

// DELETE /api/headers/:id
router.delete('/:id', protect, headerController.deleteHeader);

module.exports = router;