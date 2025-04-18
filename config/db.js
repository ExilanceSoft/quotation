const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // 5 seconds timeout
      socketTimeoutMS: 45000 // 45 seconds socket timeout
    });
    logger.info('MongoDB Connected Successfully');
  } catch (err) {
    logger.error('MongoDB Connection Error:', err);
    // Exit process with failure
    process.exit(1);
  }
};

// Event listeners for MongoDB connection
mongoose.connection.on('connected', () => {
  logger.info('Mongoose connected to DB cluster');
});

mongoose.connection.on('error', (err) => {
  logger.error(`Mongoose connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected from DB');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('Mongoose connection closed due to app termination');
  process.exit(0);
});

module.exports = connectDB;