const Model = require('../models/Model');
// const Accessory = require('');
const Branch = require('../models/Branch');
const User = require('../models/User');
const { generateQuotationNumber } = require('./numberGenerator');
const logger = require('../config/logger');

const calculatePricing = (model, selectedAccessories = []) => {
  const rtoTax = (model.ex_showroom_price * model.rto_tax_percentage) / 100;
  const accessoriesTotal = selectedAccessories.reduce(
    (sum, acc) => sum + (acc.base_price || 0),
    0
  );

  const breakdown = {
    ex_showroom: model.ex_showroom_price,
    rto_tax: rtoTax,
    insurance: model.default_insurance,
    pdi_handling: model.pdi_handling,
    hpa: model.hpa_charges,
    mandatory_fitments: model.mandatory_fitments,
    accessories: accessoriesTotal
  };

  const total = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

  return { breakdown, total };
};

const formatAccessories = (accessories, isMandatory = false) => {
  return accessories.map(acc => ({
    id: acc._id,
    name: acc.name,
    price: acc.base_price,
    type: isMandatory ? 'mandatory' : 'optional',
    image: acc.image_url,
    description: acc.description
  }));
};

const findComparisonModels = async (selectedModel) => {
  try {
    // Find models in the same group with lower and higher prices
    const models = await Model.find({
      model_group: selectedModel.model_group,
      _id: { $ne: selectedModel._id },
      is_active: true
    })
      .sort({ ex_showroom_price: 1 })
      .limit(2);

    if (models.length === 0) return { best_value: null, top_model: null };

    const bestValue = models[0];
    const topModel = models.length > 1 ? models[1] : null;

    return {
      best_value: bestValue,
      top_model: topModel
    };
  } catch (err) {
    logger.error('Error finding comparison models:', err);
    return { best_value: null, top_model: null };
  }
};

const formatModelForQuotation = async (model, type, selectedAccessories = []) => {
  const pricing = calculatePricing(model, selectedAccessories);

  return {
    id: model._id,
    name: model.name,
    type: type,
    image_url: model.image_url,
    technical_specs: {
      engine_cc: model.engine_cc,
      fuel_type: model.fuel_type,
      gearbox: model.gearbox
    },
    color_options: model.color_options,
    pricing: {
      breakdown: pricing.breakdown,
      total: pricing.total,
      ...(type !== 'selected' && {
        difference: pricing.total - calculatePricing(model).total
      })
    },
    accessories: formatAccessories(selectedAccessories, type === 'selected')
  };
};

const generateQuotation = async (data) => {
  try {
    const {
      customerDetails,
      modelId,
      branchId,
      userId,
      selectedAccessoryIds = [],
      financeRequired = false,
      testRideRequested = false,
      expectedDeliveryDate
    } = data;

    // Get all required data
    const [selectedModel, branch, user] = await Promise.all([
      Model.findById(modelId),
      Branch.findById(branchId),
      User.findById(userId).select('full_name')
    ]);

    if (!selectedModel || !branch || !user) {
      throw new Error('Required data not found');
    }

    // Get selected accessories
    const selectedAccessories = await Accessory.find({
      _id: { $in: selectedAccessoryIds }
    });

    // Find comparison models
    const { best_value, top_model } = await findComparisonModels(selectedModel);

    // Format dates
    const now = new Date();
    const quotationDate = now.toLocaleDateString('en-GB');
    const expiryDate = new Date(now.setMonth(now.getMonth() + 1)).toLocaleDateString('en-GB');

    // Create quotation object
    const quotation = {
      quotation_number: generateQuotationNumber(),
      date: quotationDate,
      customer_details: customerDetails,
      selected_model: await formatModelForQuotation(
        selectedModel,
        'selected',
        selectedAccessories
      ),
      comparison_models: {
        best_value: best_value
          ? await formatModelForQuotation(best_value, 'best_value')
          : null,
        top_model: top_model
          ? await formatModelForQuotation(top_model, 'top_model')
          : null
      },
      meta: {
        quotation_date: quotationDate,
        expiry_date: expiryDate,
        branch: branch.name,
        sales_person: user.full_name,
        branch_mobile: branch.phone,
        gst_number: branch.gst_number,
        branch_address: `${branch.address}, ${branch.city}, ${branch.state} - ${branch.pincode}`
      },
      finance_required: financeRequired,
      test_ride_requested: testRideRequested,
      expected_delivery_date: expectedDeliveryDate,
      branch_id: branchId,
      created_by: userId
    };

    logger.info(`Successfully generated quotation for ${customerDetails.name}`);
    return quotation;
  } catch (err) {
    logger.error('Error generating quotation:', err);
    throw err;
  }
};

module.exports = {
  generateQuotation,
  calculatePricing,
  formatModelForQuotation
};