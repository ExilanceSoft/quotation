const Quotation = require('../models/QuotationModel');
const axios = require('axios');
const AppError = require('../utils/appError');
const logger = require('../config/logger');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Helper function to format WhatsApp message
const formatWhatsAppMessage = (quotation) => {
  let message = `*Quotation Details*\n\n`;
  message += `*Quotation Number:* ${quotation.quotation_number}\n`;
  message += `*Customer Name:* ${quotation.customerDetails.name}\n`;
  message += `*Date:* ${new Date(quotation.date).toLocaleDateString()}\n\n`;
  
  message += `*Vehicle Details*\n`;
  quotation.models.forEach(model => {
    message += `- *Model:* ${model.model_name}\n`;
    message += `  *Base Price:* ₹${model.base_price.toLocaleString('en-IN')}\n`;
  });
  
  message += `\nPlease find attached quotation PDF for complete details.`;
  
  return message;
};

exports.sendQuotationViaWhatsApp = async (req, res, next) => {
  try {
    const { quotationId } = req.body;

    // Validate inputs
    if (!quotationId) {
      return next(new AppError('Quotation ID is required', 400));
    }

    // Get quotation data
    const quotation = await Quotation.findById(quotationId)
      .populate('customer');

    if (!quotation) {
      return next(new AppError('Quotation not found', 404));
    }

    // Check if PDF exists
    if (!quotation.pdfUrl) {
      return next(new AppError('Quotation PDF not found', 404));
    }

    // Get mobile numbers from customer
    const numbers = [];
    if (quotation.customer?.mobile1) {
      numbers.push(quotation.customer.mobile1.replace(/\D/g, ''));
    }
    if (quotation.customer?.mobile2) {
      numbers.push(quotation.customer.mobile2.replace(/\D/g, ''));
    }

    if (numbers.length === 0) {
      return next(new AppError('No valid mobile numbers found for this customer', 400));
    }

    // Format message
    const message = formatWhatsAppMessage(quotation);

    // For local testing - use a test PDF URL that works with HappySMS
    const testPdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

    // In production, use the actual PDF URL
    const pdfUrl = process.env.NODE_ENV === 'production' 
      ? `${req.protocol}://${req.get('host')}${quotation.pdfUrl}`
      : testPdfUrl;

    // Send to each number
    const results = [];
    for (const number of numbers) {
      try {
        // Format number (remove non-digits)
        const formattedNumber = number.replace(/\D/g, '');
        if (formattedNumber.length < 10) {
          results.push({
            number,
            status: 'failed',
            reason: 'Invalid phone number'
          });
          continue;
        }
        
        // HappySMS API expects number without country code
        const whatsappNumber = formattedNumber;

        // Create simple GET request URL
        const apiUrl = new URL(`${process.env.WHATSAPP_API_BASE_URL}/wapp/v2/api/send`);
        apiUrl.searchParams.append('apikey', process.env.WHATSAPP_API_KEY);
        apiUrl.searchParams.append('mobile', whatsappNumber);
        apiUrl.searchParams.append('msg', message);
        apiUrl.searchParams.append('pdf', pdfUrl);

        // Log the request URL for debugging (remove API key from logs)
        const logUrl = apiUrl.toString().replace(
          new RegExp(process.env.WHATSAPP_API_KEY, 'g'), 
          '***'
        );
        logger.debug(`Sending WhatsApp request: ${logUrl}`);

        // Send via HappySMS API as simple GET request
        const response = await axios.get(apiUrl.toString(), {
          timeout: 30000 // 30 seconds timeout
        });

        // Validate the response
        if (!response.data) {
          throw new Error('Empty response from WhatsApp API');
        }

        // Check if the API returned an error
        if (response.data.status === 'error') {
          throw new Error(response.data.msg || 'WhatsApp API error');
        }

        results.push({
          number,
          status: 'success',
          response: response.data
        });

        logger.info(`WhatsApp message sent successfully to ${whatsappNumber}`);
      } catch (err) {
        const errorMessage = err.response?.data?.message || err.message;
        logger.error(`Error sending WhatsApp to ${number}: ${errorMessage}`);
        
        results.push({
          number,
          status: 'failed',
          error: errorMessage,
          ...(err.response && { 
            statusCode: err.response.status,
            responseData: err.response.data 
          })
        });
      }
    }

    // Check if all attempts failed
    const allFailed = results.every(result => result.status === 'failed');
    if (allFailed) {
      return next(new AppError('Failed to send WhatsApp message to all numbers', 400));
    }

    res.status(200).json({
      status: 'success',
      data: {
        results
      }
    });

  } catch (err) {
    logger.error(`Error in sendQuotationViaWhatsApp: ${err.message}`);
    next(err);
  }
};