const path = require('path');
const fs = require('fs');
const handlebars = require('handlebars');
const puppeteer = require('puppeteer');
const logger = require('../config/logger');

// Register all Handlebars helpers
function registerHelpers() {
  handlebars.registerHelper('lt', function (a, b) {
    return a < b;
  });

  handlebars.registerHelper('shouldMoveToEnd', function(prices, baseModel) {
    return false; // Always show all columns
  });

 handlebars.registerHelper('formatCurrency', function (value) {
  if (value === undefined || value === null) return '0';
  return new Intl.NumberFormat('en-IN', {
    style: 'decimal', // Changed from 'currency' to 'decimal'
    maximumFractionDigits: 0
  }).format(value);
});
handlebars.registerHelper('hasAccessories', function(prices) {
  if (!prices || !Array.isArray(prices)) return false;
  return prices.some(p => 
    p.category_key && 
    (p.category_key.toLowerCase().includes("addonservices") || 
     p.category_key.toLowerCase().includes("accesories"))
  );
});
  handlebars.registerHelper('some', function(array, property, value, options) {
    if (!array || !Array.isArray(array)) return false;
    return array.some(item => item[property] === value);
  });

  handlebars.registerHelper('math', function (lvalue, operator, rvalue) {
    lvalue = parseFloat(lvalue || 0);
    rvalue = parseFloat(rvalue || 0);
    return {
      "+": lvalue + rvalue,
      "-": lvalue - rvalue,
      "*": lvalue * rvalue,
      "/": lvalue / rvalue,
      "%": lvalue % rvalue
    }[operator];
  });

  handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
    return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
  });

  handlebars.registerHelper('times', function(n, block) {
    let accum = '';
    for(let i = 0; i < n; i++) {
      accum += block.fn(i);
    }
    return accum;
  });

  handlebars.registerHelper('gt', function (a, b) {
    return a > b;
  });

  handlebars.registerHelper('lookup', function (obj, key) {
    if (!obj) return null;
    return obj[key] || null;
  });
  // Add this to your registerHelpers() function in pdfGenerator.js
handlebars.registerHelper('mod', function (a, b) {
  return a % b;
});
  handlebars.registerHelper('findPrice', function (prices, headerKey) {
    if (!prices || !Array.isArray(prices)) return null;
    const found = prices.find(p => p.header_key === headerKey);
    return found ? found.value : null;
  });

  handlebars.registerHelper('eq', function (a, b) {
    return a === b;
  });

  handlebars.registerHelper('or', function (a, b) {
    return a || b;
  });

  handlebars.registerHelper('ifeq', function (a, b, options) {
    if (a === b) {
      return options.fn(this);
    }
    return options.inverse ? options.inverse(this) : '';
  });

  handlebars.registerHelper('sortPrices', function (prices, categoryKey, includeZero) {
    if (!prices || !Array.isArray(prices)) return [];

    const filtered = prices.filter(p => {
      const matchesCategory = !categoryKey ||
        (p.category_key && p.category_key.toLowerCase().includes(categoryKey.toLowerCase()));
      if (includeZero) return matchesCategory;
      return matchesCategory && p.value !== 0 && p.value !== '0';
    });

    const nonZeroPrices = filtered.filter(p => p.value && p.value !== 0 && p.value !== '0');
    const zeroPrices = filtered.filter(p => !p.value || p.value === 0 || p.value === '0');

    return [...nonZeroPrices, ...zeroPrices];
  });

  handlebars.registerHelper('calculateGrandTotal', function (selectedModels, baseModel) {
    let total = 0;

    selectedModels.forEach(model => {
      const exShowroom = model.ex_showroom_price || 0;
      const rtoTax = (model.prices && model.prices[1] && model.prices[1].value) || 0;
      const insurance = (model.prices && model.prices[2] && model.prices[2].value) || 0;
      const accessories = (model.prices && model.prices[3] && model.prices[3].value) || 0;
      total += exShowroom + rtoTax + insurance + accessories;
    });

    if (baseModel) {
      const basePrice = baseModel.price || 0;
      const firstModelPrice = (selectedModels[0] && selectedModels[0].ex_showroom_price) || 0;
      total += (firstModelPrice - basePrice);
    }

    return total;
  });
}

const generateQuotationPDF = async (quotationData, outputPath) => {
  try {
    // Register helpers before anything else
    registerHelpers();

    // Read and encode logo image as base64 string
    const logoPath = path.join(__dirname, '../public/images/logo.png');
    let logoBase64 = '';
    if (fs.existsSync(logoPath) && fs.lstatSync(logoPath).isFile()) {
      logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath, 'base64')}`;
    } else {
      logger.warn(`Logo file not found or is not a file at path: ${logoPath}`);
    }

    // Read and compile Handlebars template (quotation.html)
    const templatePath = path.join(__dirname, '../templates/quotation.html');
    if (!fs.existsSync(templatePath) || !fs.lstatSync(templatePath).isFile()) {
      throw new Error(`Template file not found or is not a file: ${templatePath}`);
    }
    const htmlTemplate = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(htmlTemplate);

    // Prepare data for template
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
        : 'Not specified',
      base_model: quotationData.base_model ? {
        model_name: quotationData.base_model.model_name,
        prices: quotationData.base_model.model.prices.map(p => ({
          value: p.value,
          header_key: p.header_id?.header_key || p.header_key || 'deleted',
          category_key: p.header_id?.category_key || p.category_key || 'deleted'
        }))
      } : null
    };

    const html = template(formattedData);

    // Launch Puppeteer and generate PDF
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm'
      }
    });

    await browser.close();

    return outputPath;

  } catch (err) {
    logger.error(`PDF generation error: ${err.message}`, { stack: err.stack });
    throw new Error(`PDF generation failed: ${err.message}`);
  }
};

module.exports = { generateQuotationPDF };