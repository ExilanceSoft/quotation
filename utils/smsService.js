const axios = require('axios');
const logger = require('../config/logger');
const { ErrorResponse } = require('./errorHandler');

// SMS configuration - now using environment variables
const SMS_CONFIG = {
  baseUrl: process.env.SMS_BASE_URL || 'https://sms.happysms.in',
  username: process.env.SMS_USERNAME || 'suyog55777',
  password: process.env.SMS_PASSWORD || '121212',
  senderId: process.env.SMS_SENDER_ID || 'GNDTVS',
  template_id: process.env.SMS_TEMPLATE_ID || '1707174731188793226'
};

// Generate random OTP (6 digits)
exports.generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP via SMS with enhanced error handling
exports.sendOTPSMS = async (mobile, otp) => {
  try {
    // Validate mobile number format
    if (!/^[0-9]{10}$/.test(mobile)) {
      throw new ErrorResponse('Invalid mobile number format', 400);
    }

    const message = `Your verification OTP is ${otp}. Valid for 10 minutes.`;

    // Log the request for debugging
    logger.debug(`Sending SMS to ${mobile} with OTP ${otp}`);

    const response = await axios.get(`${SMS_CONFIG.baseUrl}/api/v2/sendsms`, {
      params: {
        username: SMS_CONFIG.username,
        password: SMS_CONFIG.password,
        sender: SMS_CONFIG.senderId,
        sendto: mobile,
        message: message,
        template_id: SMS_CONFIG.template_id,
      },
      timeout: 10000 // 10 seconds timeout
    });

    // Log full response for debugging
    logger.debug(`SMS API response: ${JSON.stringify(response.data)}`);

    if (!response.data || response.data.status !== 'success') {
      const errorMsg = response.data?.message || 'Unknown SMS API error';
      logger.error(`Failed to send SMS: ${errorMsg}`);
      throw new ErrorResponse(`Failed to send OTP: ${errorMsg}`, 500);
    }

    logger.info(`OTP SMS successfully sent to ${mobile}`);
    return true;
  } catch (err) {
    logger.error(`SMS sending error: ${err.message}`, { 
      stack: err.stack,
      mobile,
      errorResponse: err.response?.data 
    });
    
    // Handle specific axios errors
    if (err.code === 'ECONNABORTED') {
      throw new ErrorResponse('SMS service timeout', 500);
    }
    if (err.response) {
      // The request was made and the server responded with a status code
      throw new ErrorResponse(`SMS service error: ${err.response.status}`, 500);
    } else if (err.request) {
      // The request was made but no response was received
      throw new ErrorResponse('No response from SMS service', 500);
    } else {
      // Something happened in setting up the request
      throw new ErrorResponse('SMS service configuration error', 500);
    }
  }
};