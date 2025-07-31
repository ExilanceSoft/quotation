const axios = require('axios');
const logger = require('../config/logger');

const SMS_CONFIG = {
  BASE_URL: 'https://sms.happysms.in/api/sendhttp.php',
  AUTH_KEY: '449042AUThwq6Y6811e857P1',
  SENDER_ID: 'GNDTVS',
  ROUTE: '4',
  COUNTRY: '91',
  DLT_TE_ID: '1707174731188793226'
};

// Improved mobile number validation
const validateMobileNumber = (mobile) => {
  // Remove all non-digit characters
  const cleaned = mobile.replace(/\D/g, '');
  
  // Must be 10 digits (without country code) or 12 digits (with 91)
  if (!/^(?:\d{10}|91\d{10})$/.test(cleaned)) {
    throw new Error('Invalid mobile number format');
  }
  
  // Ensure it starts with 6-9 (Indian mobile numbers)
  const digits = cleaned.length === 10 ? cleaned : cleaned.substring(2);
  if (!/^[6-9]/.test(digits)) {
    throw new Error('Invalid Indian mobile number');
  }
  
  // Return in 91XXXXXXXXXX format
  return cleaned.length === 10 ? `91${cleaned}` : cleaned;
};

// Generate 6-digit OTP
exports.generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Improved SMS sending function
exports.sendOTPSMS = async (mobile, otp) => {
  try {
    const validatedMobile = validateMobileNumber(mobile);
    const message = `${otp} is your One Time Verification (OTP) code to confirm your phone for GANDHI MOTORS PRIVATE LIMITED`;

    const params = new URLSearchParams();
    params.append('authkey', SMS_CONFIG.AUTH_KEY);
    params.append('mobiles', validatedMobile);
    params.append('message', message);
    params.append('sender', SMS_CONFIG.SENDER_ID);
    params.append('route', SMS_CONFIG.ROUTE);
    params.append('country', SMS_CONFIG.COUNTRY);
    params.append('DLT_TE_ID', SMS_CONFIG.DLT_TE_ID);
    params.append('response', 'json');

    logger.debug(`Sending SMS to ${validatedMobile}`, { params: params.toString() });

    const response = await axios.get(SMS_CONFIG.BASE_URL, {
      params,
      timeout: 10000
    });

    logger.debug('SMS API response:', response.data);

    // Handle different response formats
    if (typeof response.data === 'string') {
      if (response.data.includes('Invalid') || response.data.includes('Error')) {
        throw new Error(response.data);
      }
      return { success: true, messageId: response.data };
    }

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    return { 
      success: true,
      message: 'OTP sent successfully',
      mobile: validatedMobile,
      messageId: response.data.request_id || 'N/A'
    };
  } catch (error) {
    logger.error('SMS sending failed:', {
      error: error.message,
      response: error.response?.data,
      config: error.config?.params,
      stack: error.stack
    });
    throw new Error('Failed to send OTP. Please try again.');
  }
};