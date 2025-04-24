const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ErrorResponse } = require('./errorHandler');
const logger = require('../config/logger');

// Define and ensure the upload directory exists
const uploadDir = path.join(__dirname, '../public/uploads/models');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'model-' + uniqueSuffix + ext);
  }
});

// File filter to allow only image types
const fileFilter = (req, file, cb) => {
  const filetypes = /jpe?g|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new ErrorResponse('Only image files (jpeg, jpg, png, gif) are allowed!', 400));
  }
};

// Configure multer middleware
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Limit: 5MB
    files: 1
  },
  fileFilter: fileFilter
});

module.exports = upload;
