// app.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const logger = require('./config/logger');
const initializeRoles = require('./utils/initializeRoles');

// Initialize Express app
const app = express();

// Use Helmet for security
app.use(helmet());

// CORS Configuration
const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3003',  'http://192.168.1.7:3000','http://192.168.1.7:5001'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE','PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate Limiting Middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000 
});
app.use(limiter);

// Body Parsers - Moved before routes
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use('/api/uploads', (req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST,http://localhost:3000,http://192.168.1.7:5001 OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
  next();
});

app.use('/api/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Logger for all requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// Import Routes
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const accessoryRoutes = require('./routes/accessoryRoutes');
const quotationRoutes = require('./routes/quotationRoutes');
const branchRoutes = require('./routes/branchRoutes');
const financeDocumentRoutes = require('./routes/financeDocumentRoutes');
const termsConditionRoutes = require('./routes/termsConditionRoutes');
const headerRoutes = require('./routes/headerRoutes');
const modelRoutes = require('./routes/modelRoutes');
const csvRoutes = require('./routes/csvRoutes');
const offerRoutes = require('./routes/offerRoutes');
const customerRoutes = require('./routes/customerRoutes');


// Mount Routes
app.use('/api/customers', customerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/accessories', accessoryRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/finance-documents', financeDocumentRoutes);
app.use('/api/terms-conditions', termsConditionRoutes);
app.use('/api/headers', headerRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/csv', csvRoutes);
app.use('/api/offers', offerRoutes);

// Health Check Endpoint
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    status: 'OK',
    database: dbStatus,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `Can't find ${req.originalUrl} on this server`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  logger.error(`Error: ${err.message}`);
  logger.error(err.stack);

  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Database connection function
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });
    logger.info('✅ MongoDB Connected Successfully');
    return true;
  } catch (err) {
    logger.error('❌ MongoDB Connection Error:', err.message);
    return false;
  }
}

module.exports = { app, connectDB, initializeRoles };