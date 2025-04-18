const logger = require('../config/logger');

const generateQuotationNumber = (branchCode = 'GM') => {
  const now = new Date();
  const year = now.getFullYear();
  const randomNum = Math.floor(10000 + Math.random() * 90000).toString().padStart(5, '0');
  const quotationNumber = `${branchCode}-${year}-${randomNum}`;
  
  logger.info(`Generated quotation number: ${quotationNumber}`);
  return quotationNumber;
};

const generateModelCode = (modelName) => {
  const prefix = modelName.split(' ').map(word => word[0]).join('').toUpperCase();
  const randomNum = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${randomNum}`;
};

module.exports = {
  generateQuotationNumber,
  generateModelCode
};