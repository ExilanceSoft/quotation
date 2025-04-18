require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const logger = require('./config/logger');

// Database Connection - Updated for Mongoose 6+
mongoose.connect(process.env.MONGODB_URI)
  .then(() => logger.info('MongoDB Connected Successfully'))
  .catch(err => {
    logger.error('MongoDB Connection Error:', err);
    process.exit(1);
  });

const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    dbState: mongoose.connection.readyState,
    environment: process.env.NODE_ENV 
  });
});

// Export the app for server.js
module.exports = app;