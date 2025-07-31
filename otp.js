require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration
const CONFIG = {
    SMS_BASE_URL:'https://sms.happysms.in',
    SMS_AUTHKEY:'449042AUThwq6Y6811e857P1',
    SMS_SENDER_ID:'GNDTVS',
    DLT_TEMPLATE_ID:'1707174731188793226',
    OTP_EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES) || 5,
    OTP_LENGTH: 6,
    OTP_MESSAGE_TEMPLATE: '{#var#} is your One Time Verification (OTP) code to confirm your phone for GANDHI MOTORS PRIVATE LIMITED', // Must match DLT template exactly
    PORT: parseInt(process.env.PORT) || 5000,
    ENV: process.env.NODE_ENV || 'development'
};

// In-memory storage (use Redis in production)
const otpStorage = new Map();

// Helper Functions
const generateOTP = () => {
    const digits = '0123456789';
    let OTP = '';
    for (let i = 0; i < CONFIG.OTP_LENGTH; i++) {
        OTP += digits[Math.floor(Math.random() * 10)];
    }
    return OTP;
};

const cleanMobileNumber = (number) => {
    const cleaned = number.replace(/\D/g, '');
    if (!cleaned) throw new Error('Empty phone number');
    return cleaned.startsWith('91') ? cleaned : `91${cleaned}`;
};

// SMS Service
class SMSService {
    static async sendOTP(phoneNumber) {
        try {
            // Validate and clean mobile number
            const cleanNumber = cleanMobileNumber(phoneNumber);
            if (!/^91[6-9]\d{9}$/.test(cleanNumber)) {
                throw new Error('Invalid Indian mobile number format');
            }

            // Generate OTP
            const otp = generateOTP();
            const message = CONFIG.OTP_MESSAGE_TEMPLATE.replace('{#var#}', otp);

            // Prepare API parameters
            const params = new URLSearchParams();
            params.append('authkey', CONFIG.SMS_AUTHKEY);
            params.append('mobiles', cleanNumber);
            params.append('message', message);
            params.append('sender', CONFIG.SMS_SENDER_ID);
            params.append('route', '4'); // Transactional route
            params.append('country', '91');
            params.append('DLT_TE_ID', CONFIG.DLT_TEMPLATE_ID);
            params.append('response', 'json');

            // Debug log (masks authkey)
            const debugUrl = `${CONFIG.SMS_BASE_URL}/api/sendhttp.php?${params.toString().replace(CONFIG.SMS_AUTHKEY, '***')}`;
            console.log('[SMS Request]', {
                url: debugUrl,
                number: cleanNumber,
                message: message
            });

            // Make API request
            const response = await axios.get(`${CONFIG.SMS_BASE_URL}/api/sendhttp.php?${params.toString()}`, {
                timeout: 10000
            });

            console.log('[SMS Response]', response.data);

            // Validate response
            if (typeof response.data === 'string' && response.data.includes('Error')) {
                throw new Error(response.data);
            }

            // Store OTP with expiry
            otpStorage.set(cleanNumber, {
                otp,
                expiresAt: Date.now() + (CONFIG.OTP_EXPIRY_MINUTES * 60 * 1000),
                messageId: response.data.request_id || response.data
            });

            return {
                success: true,
                message: 'OTP sent successfully',
                messageId: response.data.request_id || response.data,
                ...(CONFIG.ENV === 'development' && { debugOtp: otp })
            };
        } catch (error) {
            console.error('[SMS Error]', error.message, error.response?.data);
            return {
                success: false,
                message: error.response?.data?.message || error.message,
                error: 'Failed to process OTP request'
            };
        }
    }

    static async verifyOTP(phoneNumber, otp) {
        try {
            const cleanNumber = cleanMobileNumber(phoneNumber);
            const storedData = otpStorage.get(cleanNumber);
            
            if (!storedData) {
                return { 
                    success: false, 
                    message: 'OTP not found. Please request a new OTP.' 
                };
            }

            if (Date.now() > storedData.expiresAt) {
                otpStorage.delete(cleanNumber);
                return { 
                    success: false, 
                    message: 'OTP has expired. Please request a new OTP.' 
                };
            }

            if (storedData.otp !== otp) {
                return { 
                    success: false, 
                    message: 'Invalid OTP entered. Please try again.' 
                };
            }

            otpStorage.delete(cleanNumber);
            return { 
                success: true, 
                message: 'OTP verified successfully' 
            };
        } catch (error) {
            console.error('[Verification Error]', error.message);
            return { 
                success: false, 
                message: 'OTP verification failed',
                error: error.message 
            };
        }
    }
}

// Routes
app.post('/send-otp', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone number is required' 
            });
        }

        const result = await SMSService.sendOTP(phoneNumber);

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (error) {
        console.error('[Route Error] /send-otp', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

app.post('/verify-otp', async (req, res) => {
    try {
        const { phoneNumber, otp } = req.body;
        
        if (!phoneNumber || !otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Both phone number and OTP are required' 
            });
        }

        const result = await SMSService.verifyOTP(phoneNumber, otp);
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error('[Route Error] /verify-otp', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Start Server
app.listen(CONFIG.PORT, () => {
    console.log(`OTP Service running on port ${CONFIG.PORT}`);
    console.log('Environment:', CONFIG.ENV);
    console.log('Configuration:', {
        ...CONFIG,
        SMS_AUTHKEY: '***', // Mask sensitive data
        SMS_BASE_URL: CONFIG.SMS_BASE_URL,
        DLT_TEMPLATE_ID: CONFIG.DLT_TEMPLATE_ID
    });
});