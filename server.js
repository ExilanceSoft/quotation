require('dotenv').config();
const { app, connectDB, initializeRoles } = require('./app');
const logger = require('./config/logger');

// Check required environment variables
const requiredEnvVars = ['MONGODB_URI', 'PORT', 'JWT_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    logger.info('Starting server initialization...');

    logger.info('Connecting to MongoDB...');
    const isConnected = await connectDB();
    if (!isConnected) throw new Error('Failed to connect to MongoDB');

    logger.info('Initializing roles...');
    await initializeRoles();

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    process.on('unhandledRejection', (err) => {
      logger.error('UNHANDLED REJECTION! Shutting down...');
      logger.error(err.stack);
      server.close(() => process.exit(1));
    });

    const shutdownHandler = (signal) => {
      logger.info(`${signal} RECEIVED. Shutting down gracefully...`);
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => shutdownHandler('SIGINT'));

  } catch (err) {
    logger.error('Fatal error during startup:', err);
    process.exit(1);
  }
};

startServer();
