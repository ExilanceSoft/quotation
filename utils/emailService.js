const nodemailer = require('nodemailer');
const logger = require('../config/logger');

// Create a transporter with more secure configuration
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false // Only for development, remove in production
  }
});

// Verify transporter connection
transporter.verify((error) => {
  if (error) {
    logger.error('Error verifying email transporter:', error);
  } else {
    logger.info('Email transporter is ready');
  }
});

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email with retry logic
const sendOTPEmail = async (email, otp, retries = 3) => {
  try {
    const mailOptions = {
      from: `"Vehicle Quotation System" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: 'Your OTP for Login',
      text: `Your OTP is: ${otp}. It will expire in 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Vehicle Quotation System Login</h2>
          <p>Your one-time password (OTP) is:</p>
          <div style="background: #f4f4f4; padding: 10px; margin: 10px 0; font-size: 24px; font-weight: bold; text-align: center;">
            ${otp}
          </div>
          <p>This OTP will expire in 10 minutes.</p>
          <p style="font-size: 12px; color: #999;">If you didn't request this OTP, please ignore this email.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    logger.info(`OTP sent to ${email}`);
  } catch (err) {
    logger.error(`Error sending OTP email (attempt ${4-retries}): ${err.message}`);
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      return sendOTPEmail(email, otp, retries - 1);
    }
    throw new Error('Failed to send OTP after multiple attempts');
  }
};

module.exports = { generateOTP, sendOTPEmail };