const path = require('path');
const fs = require('fs');
const handlebars = require('handlebars');
const puppeteer = require('puppeteer');
const logger = require('../config/logger');

function registerHelpers() {
  // Comparison Helpers
  handlebars.registerHelper('eq', function(a, b) {
    return a === b;
  });

  handlebars.registerHelper('lt', function(a, b) {
    return a < b;
  });

  handlebars.registerHelper('gt', function(a, b) {
    return a > b;
  });

  // Logical Helpers
  handlebars.registerHelper('and', function() {
    return Array.prototype.slice.call(arguments, 0, -1).every(Boolean);
  });

  handlebars.registerHelper('or', function() {
    return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
  });

  // Math Helpers
  handlebars.registerHelper('math', function(lvalue, operator, rvalue) {
    lvalue = parseFloat(lvalue);
    rvalue = parseFloat(rvalue);
    return {
      '+': lvalue + rvalue,
      '-': lvalue - rvalue,
      '*': lvalue * rvalue,
      '/': lvalue / rvalue,
      '%': lvalue % rvalue
    }[operator];
  });

  handlebars.registerHelper('mod', function(a, b) {
    return a % b;
  });

  // Loop Helper
  handlebars.registerHelper('times', function(n, block) {
    let accum = '';
    for (let i = 0; i < n; i++) {
      accum += block.fn(i);
    }
    return accum;
  });

  // Formatting Helpers
  handlebars.registerHelper('formatCurrency', function(value) {
    if (isNaN(value)) return '0';
    return new Intl.NumberFormat('en-IN').format(value);
  });

  // Data Helpers
  handlebars.registerHelper('findPrice', function(prices, headerKey) {
    if (!Array.isArray(prices)) return 0;
    const item = prices.find(p => p.header_key === headerKey);
    return item ? item.value : 0;
  });

  handlebars.registerHelper('hasAccessories', function(prices) {
    if (!Array.isArray(prices)) return false;
    return prices.some(p =>
      ['addonservices', 'accesories'].includes(p.category_key.toLowerCase())
    );
  });

  handlebars.registerHelper('filterByPage', function(items, pageNo, options) {
    if (!Array.isArray(items)) return options.inverse(this);
    const filtered = items.filter(item =>
      item.metadata && item.metadata.page_no === pageNo
    );
    return filtered.length ? options.fn(filtered) : options.inverse(this);
  });

  handlebars.registerHelper('getModelName', function(models, index) {
    if (!Array.isArray(models)) return 'Selected Model';
    return models[index]?.model_name || 'Selected Model';
  });

  // New helper to get prices for specific page
  handlebars.registerHelper('getPricesForPage', function(prices, pageNo) {
    if (!Array.isArray(prices)) return [];
    return prices.filter(price =>
      price.metadata && price.metadata.page_no === pageNo
    );
  });
}

const generateQuotationPDF = async (quotationData, outputPath) => {
  try {
    registerHelpers();

    // Logo Handling
    const logoPath = path.join(__dirname, '../public/images/logo.png');
    let logoBase64 = '';
    if (fs.existsSync(logoPath)) {
      logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath, 'base64')}`;
    }

    // Template Processing
    const templatePath = path.join(__dirname, '../templates/quotation.html');
    const htmlTemplate = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(htmlTemplate);

    // Data Preparation
    const formattedData = {
      ...quotationData,
      logoBase64,
      createdDate: new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }),
      expectedDeliveryDate: quotationData.expected_delivery_date
        ? new Date(quotationData.expected_delivery_date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          })
        : 'Not specified'
    };

    // PDF Generation
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(template(formattedData), { waitUntil: 'networkidle0' });

    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      displayHeaderFooter: false,
      preferCSSPageSize: true
    });

    await browser.close();
    return outputPath;

  } catch (err) {
    logger.error(`PDF generation error: ${err.message}`, { stack: err.stack });
    throw new Error(`PDF generation failed: ${err.message}`);
  }
};

module.exports = { generateQuotationPDF };