const express = require('express');
const router = express.Router();
const csvController = require('../controllers/csvController');
const upload = require('../middlewares/uploadMiddleware');
const { protect } = require('../middlewares/auth');

// router.get('/export-template', protect, csvController.exportCSVTemplate);
// router.post('/import', protect, upload.single('file'), (req, res, next) => {
//   if (!req.body.branch_id) {
//     return res.status(400).json({ error: 'Branch ID is required' });
//   }
//   csvController.importCSV(req, res, next);
// });

router.get('/export-template', protect, (req, res, next) => {
  if (!req.query.type) {
    return res.status(400).json({ error: 'Type is required (EV/IC)' });
  }
  csvController.exportCSVTemplate(req, res, next);
});

router.post('/import', protect, upload.single('file'), (req, res, next) => {
  if (!req.body.branch_id) {
    return res.status(400).json({ error: 'Branch ID is required' });
  }
  if (!req.body.type) {
    return res.status(400).json({ error: 'Type is required (EV/ICE)' });
  }
  csvController.importCSV(req, res, next);
});

module.exports = router;