 const nodemailer = require('nodemailer');
const logger = require('../config/logger');

// Create transporter (your existing configuration is good)
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

// Enhanced email template with professional UI
const sendOTPEmail = async (email, otp, retries = 3) => {
  try {
    const mailOptions = {
      from: `"Vehicle Quotation System" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: 'Your Secure Login OTP - Vehicle Quotation System',
      text: `Your OTP is: ${otp}. It will expire in 10 minutes.`,
      html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your OTP Code</title>
          <style>
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
              }
              .header {
                  text-align: center;
                  padding: 20px 0;
                  border-bottom: 1px solid #eaeaea;
              }
              .logo {
                  max-width: 150px;
              }
              .content {
                  padding: 30px 20px;
              }
              .otp-container {
                  background: #f8f9fa;
                  border-radius: 8px;
                  padding: 15px;
                  text-align: center;
                  margin: 25px 0;
                  border: 1px dashed #dee2e6;
              }
              .otp-code {
                  font-size: 32px;
                  font-weight: bold;
                  letter-spacing: 3px;
                  color: #2c3e50;
                  margin: 10px 0;
              }
              .expiry-note {
                  color: #e74c3c;
                  font-weight: 500;
              }
              .footer {
                  text-align: center;
                  font-size: 12px;
                  color: #7f8c8d;
                  padding-top: 20px;
                  border-top: 1px solid #eaeaea;
              }
              .button {
                  display: inline-block;
                  padding: 12px 24px;
                  background-color: #3498db;
                  color: white !important;
                  text-decoration: none;
                  border-radius: 4px;
                  font-weight: bold;
                  margin: 15px 0;
              }
              .support {
                  margin-top: 30px;
                  font-size: 14px;
              }
          </style>
      </head>
      <body>
          <div class="header">
              <!-- Replace with your actual logo URL -->
              <img src="https://example.com/logo.png" alt="Vehicle Quotation System" class="logo">
              <h2 style="color: #2c3e50; margin-bottom: 0;">Secure Login Verification</h2>
          </div>
          
          <div class="content">
              <p>Hello,</p>
              <p>We received a request to sign in to your Vehicle Quotation System account. Please use the following One-Time Password (OTP):</p>
              
              <div class="otp-container">
                  <div style="font-size: 14px; color: #7f8c8d;">YOUR VERIFICATION CODE</div>
                  <div class="otp-code">${otp}</div>
                  <div style="font-size: 14px;">This code is valid for <span class="expiry-note">10 minutes</span> only.</div>
              </div>
              
              <p>For security reasons, please do not share this code with anyone. Our team will never ask you for your password or verification code.</p>
              
              <p>If you didn't request this OTP, please secure your account by changing your password immediately or contact our support team.</p>
              
              <div class="support">
                  <p>Need help? <a href="mailto:support@example.com" style="color: #3498db;">Contact our support team</a></p>
              </div>
          </div>
          
          <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Vehicle Quotation System. All rights reserved.</p>
              <p>This is an automated message, please do not reply directly to this email.</p>
          </div>
      </body>
      </html>
      `
    };

    await transporter.sendMail(mailOptions);
    logger.info(`OTP sent to ${email}`);
  } catch (err) {
    logger.error(`Error sending OTP email (attempt ${4-retries}): ${err.message}`);
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return sendOTPEmail(email, otp, retries - 1);
    }
    throw new Error('Failed to send OTP after multiple attempts');
  }
};

module.exports = { generateOTP, sendOTPEmail };