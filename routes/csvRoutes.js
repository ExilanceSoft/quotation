const express = require('express');
const router = express.Router();
const csvController = require('../controllers/csvController');
const upload = require('../middlewares/uploadMiddleware');
const { protect } = require('../middlewares/auth');

router.get('/export-template', protect, csvController.exportCSVTemplate);
router.post('/import', protect, upload.single('file'), (req, res, next) => {
  if (!req.body.branch_id) {
    return res.status(400).json({ error: 'Branch ID is required' });
  }
  csvController.importCSV(req, res, next);
});

module.exports = router;