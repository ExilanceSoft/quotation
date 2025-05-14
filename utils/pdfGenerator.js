const path = require('path');
const fs = require('fs');
const handlebars = require('handlebars');
const puppeteer = require('puppeteer');
const logger = require('../config/logger');
// Modulo helper for grouping items
function registerHelpers() {
  // Modulo helper for grouping items
  handlebars.registerHelper('mod', function(index, mod) {
    return index % mod;
  });
}

// Register all Handlebars helpers before compiling the template
function registerHelpers() {
  // Format currency helper
  handlebars.registerHelper('formatCurrency', function(value) {
    if (value === undefined || value === null) return '₹0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  });

  // Math operations helper
  handlebars.registerHelper('math', function(lvalue, operator, rvalue) {
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

  // Enhanced lookup helper for array/object access
  handlebars.registerHelper('lookup', function(obj, key) {
    if (!obj) return null;
    if (Array.isArray(obj)) {
      return obj[key] || null;
    }
    return obj[key] || null;
  });

  // Find price by header key
  handlebars.registerHelper('findPrice', function(prices, headerKey) {
    if (!prices || !Array.isArray(prices)) return null;
    const found = prices.find(p => p.header_key === headerKey);
    return found ? found.value : null;
  });

  // Simplified equality comparison helper
  handlebars.registerHelper('eq', function(a, b) {
    return a === b;
  });
 
  // OR helper
  handlebars.registerHelper('or', function(a, b) {
    return a || b;
  });

  // If equals helper for block usage
  handlebars.registerHelper('ifeq', function(a, b, options) {
    if (a === b) {
      return options.fn(this);
    }
    return options.inverse ? options.inverse(this) : '';
  });

  // Grand total calculation helper
  handlebars.registerHelper('calculateGrandTotal', function(selectedModels, baseModel) {
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
    // Register all helpers first
    registerHelpers();

    const templatePath = path.join(__dirname, '../templates/quotation.html');
    const htmlTemplate = fs.readFileSync(templatePath, 'utf8');
    
    const template = handlebars.compile(htmlTemplate);

    // Prepare the data for the template
const formattedData = {
  ...quotationData,
  
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
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      }
    });

    await browser.close();
    return outputPath;
  } catch (err) {
    logger.error(`PDF generation error: ${err.message}`);
    throw err;
  }
};

module.exports = { generateQuotationPDF };