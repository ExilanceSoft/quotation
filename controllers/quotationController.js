const Quotation = require('../models/QuotationModel');
const Customer = require('../models/CustomerModel');
const Model = require('../models/ModelModel');
const Header = require('../models/HeaderModel');
const AppError = require('../utils/appError');
const logger = require('../config/logger');

const getQuotationDetails = async (quotationId) => {
  return await Quotation.findById(quotationId)
    .populate('customer')
    .populate('creator')
    .populate('terms_conditions')
    .populate({
      path: 'models.model_id',
      select: 'model_name prices',
      populate: {
        path: 'prices.header_id',
        select: 'header_key category_key priority metadata'
      }
    })
    .populate({
      path: 'base_model_id',
      select: 'model_name prices',
      populate: {
        path: 'prices.header_id',
        select: 'header_key category_key priority metadata'
      }
    });
};


exports.createQuotation = async (req, res, next) => {
  try {
    const { 
      customerDetails, 
      selectedModels, 
      expected_delivery_date,
      finance_needed = false // Add finance_needed field with default false
    } = req.body;

    // Validate input
    if (!customerDetails || !selectedModels || !Array.isArray(selectedModels)) {
      return next(new AppError('Missing required fields or invalid data format', 400));
    }

    // 1. Create or find customer
    let customer;
    if (customerDetails._id) {
      customer = await Customer.findById(customerDetails._id);
      if (!customer) {
        return next(new AppError('Customer not found', 404));
      }
    } else {
      // Validate required customer fields
      if (!customerDetails.name || !customerDetails.address || !customerDetails.mobile1) {
        return next(new AppError('Missing required customer fields', 400));
      }

      customer = await Customer.create({
        name: customerDetails.name,
        address: customerDetails.address,
        taluka: customerDetails.taluka || '',
        district: customerDetails.district || '',
        mobile1: customerDetails.mobile1,
        mobile2: customerDetails.mobile2 || '',
        createdBy: req.user.id
      });
    }

    // 2. Get full model details
    const models = await Model.find({
      _id: { $in: selectedModels.map(m => m.model_id) }
    }).populate({
      path: 'prices.header_id',
      select: 'header_key category_key priority metadata'
    });

    if (models.length !== selectedModels.length) {
      return next(new AppError('One or more model IDs are invalid', 400));
    }

    // 3. Find Ex-Showroom header
    const headers = await Header.find();
    const exShowroomHeader = headers.find(h => 
      h.header_key.toLowerCase().includes('ex-showroom') || 
      h.category_key.toLowerCase().includes('ex-showroom')
    );

    if (!exShowroomHeader) {
      logger.warn('Ex-Showroom price header not found in database');
    }

    // 4. Prepare response with model details and collect base models
    const allBaseModels = [];
    const responseModels = await Promise.all(models.map(async model => {
      // Find Ex-Showroom price
      const exShowroomPrice = exShowroomHeader 
        ? model.prices.find(p => p.header_id._id.equals(exShowroomHeader._id))?.value
        : null;

      // Get series name (first word of model name)
      const seriesMatch = model.model_name.match(/^([A-Za-z0-9]+)/);
      const series = seriesMatch ? seriesMatch[1] : 'Unknown';

      // Find base model for this series
      let baseModel = null;
      let isBaseModel = false;
      
      if (series) {
        const seriesModels = await Model.find({
          model_name: new RegExp(`^${series}`)
        }).populate({
          path: 'prices.header_id',
          select: 'header_key category_key'
        });

        if (seriesModels.length > 0) {
          const modelsWithPrices = seriesModels.map(m => {
            const price = exShowroomHeader 
              ? m.prices.find(p => p.header_id._id.equals(exShowroomHeader._id))?.value
              : null;
            return {
              model_id: m._id,
              model_name: m.model_name,
              price: price,
              model: m // Store the full model document
            };
          }).filter(m => m.price !== null && m.price !== undefined);

          if (modelsWithPrices.length > 0) {
            modelsWithPrices.sort((a, b) => a.price - b.price);
            baseModel = modelsWithPrices[0];
            
            // Check if selected model is the base model
            isBaseModel = baseModel.model_id.toString() === model._id.toString();
            
            if (!isBaseModel) {
              allBaseModels.push(baseModel);
            }
          }
        }
      }
      return {
        selected_model: {
          _id: model._id,
          model_name: model.model_name,
          prices: model.prices.map(p => ({
            value: p.value,
            header_key: p.header_id?.header_key || 'deleted',
            category_key: p.header_id?.category_key || 'deleted',
            priority: p.header_id?.priority || 0,
            metadata: p.header_id?.metadata || {}
          })),
          ex_showroom_price: exShowroomPrice,
          series: series,
          createdAt: model.createdAt,
          is_base_model: isBaseModel
        }
      };
    }));

    // 5. Find the lowest priced base model across all series (only if not all selected models are base models)
    let finalBaseModel = null;
    const allSelectedAreBaseModels = responseModels.every(m => m.selected_model.is_base_model);
    
    if (!allSelectedAreBaseModels && allBaseModels.length > 0) {
      allBaseModels.sort((a, b) => a.price - b.price);
      const lowestBaseModel = allBaseModels[0];

      // Get full details of the lowest base model
      const fullBaseModel = await Model.findById(lowestBaseModel.model_id)
        .populate({
          path: 'prices.header_id',
          select: 'header_key category_key priority metadata'
        });

      if (fullBaseModel) {
        finalBaseModel = {
          _id: fullBaseModel._id,
          model_name: fullBaseModel.model_name,
          prices: fullBaseModel.prices.map(p => ({
            value: p.value,
            header_key: p.header_id?.header_key || 'deleted',
            category_key: p.header_id?.category_key || 'deleted',
            priority: p.header_id?.priority || 0,
            metadata: p.header_id?.metadata || {}
          })),
          ex_showroom_price: exShowroomHeader 
            ? fullBaseModel.prices.find(p => p.header_id._id.equals(exShowroomHeader._id))?.value
            : null,
          series: fullBaseModel.model_name.match(/^([A-Za-z0-9]+)/)?.[1] || 'Unknown',
          createdAt: fullBaseModel.createdAt
        };
      }
    }

    // 6. Create and save the quotation to database
    const quotation = await Quotation.create({
      customer_id: customer._id,
      models: responseModels.map(m => ({
        model_id: m.selected_model._id,
        model_name: m.selected_model.model_name,
        base_price: m.selected_model.ex_showroom_price || 0,
        final_price: m.selected_model.ex_showroom_price || 0
      })),
      expected_delivery_date,
      finance_needed, // Save finance_needed status
      createdBy: req.user.id,
      total_amount: responseModels.reduce((sum, m) => sum + (m.selected_model.ex_showroom_price || 0), 0),
      tax_amount: responseModels.reduce((sum, m) => sum + (m.selected_model.ex_showroom_price || 0), 0) * 0.18,
      grand_total: responseModels.reduce((sum, m) => sum + (m.selected_model.ex_showroom_price || 0), 0) * 1.18
    });

    // 7. Prepare the final response
    const response = {
      customerDetails: {
        _id: customer._id,
        name: customer.name,
        address: customer.address,
        taluka: customer.taluka,
        district: customer.district,
        mobile1: customer.mobile1,
        mobile2: customer.mobile2,
        finance_needed: quotation.finance_needed,
        createdAt: customer.createdAt
      },
      expected_delivery_date: expected_delivery_date || null,
      selectedModels: responseModels,
      quotation_id: quotation._id,
      quotation_number: quotation.quotation_number,
      userDetails: {
        _id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        mobile: req.user.mobile,
        full_name: req.user.full_name,
        // Virtual fields
        branch: req.user.branch ? {
          _id: req.user.branch._id,
          name: req.user.branch.name,
          address: req.user.branch.address,
          city: req.user.branch.city,
          state: req.user.branch.state,
          pincode: req.user.branch.pincode,
          phone: req.user.branch.phone,
          email: req.user.branch.email,
          gst_number: req.user.branch.gst_number,
          is_active: req.user.branch.is_active
        } : null,
        role: req.user.role ? {
          _id: req.user.role._id,
          name: req.user.role.name,
          description: req.user.role.description,
          is_default: req.user.role.is_default,
        } : null
      }
    };

    // Only include base_model if there is one and not all selected are base models
    if (finalBaseModel && !allSelectedAreBaseModels) {
      response.base_model = finalBaseModel;
    }

    res.status(200).json({
      status: 'success',
      data: response
    });
  } catch (err) {
    logger.error(`Error in quotation preparation: ${err.message}`);
    next(err);
  }
};

// Get all quotations
exports.getAllQuotations = async (req, res, next) => {
  try {
    const quotations = await Quotation.find()
      .populate('customer', 'name mobile1')
      .populate('creator', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      results: quotations.length,
      data: {
        quotations
      }
    });
  } catch (err) {
    next(err);
  }
};



