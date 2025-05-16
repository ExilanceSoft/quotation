const Quotation = require('../models/QuotationModel');
const Customer = require('../models/CustomerModel');
const Model = require('../models/ModelModel');
const Header = require('../models/HeaderModel');
const AppError = require('../utils/appError');
const logger = require('../config/logger');
const Offer = require('../models/OfferModel');
const mongoose = require('mongoose');
const User = require('../models/User');
const Branch = require('../models/Branch');
const FinanceDocument = require('../models/FinanceDocument');
const TermsCondition = require('../models/TermsCondition');
const pdfGenerator = require('../utils/pdfGenerator');
const path = require('path');
const fs = require('fs');

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

const isValidModelId = (modelId) => {
  return modelId && mongoose.Types.ObjectId.isValid(modelId);
};

exports.createQuotation = async (req, res, next) => {
  try {
    const { 
      customerDetails, 
      selectedModels, 
      expected_delivery_date,
      finance_needed = false
    } = req.body;

    const creator = req.user;

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
        createdBy: creator._id
      });
    }

    // 2. Get all finance documents
    const financeDocuments = await FinanceDocument.find({}).sort({ createdAt: 1 });
    logger.info(`Fetched ${financeDocuments.length} finance documents`);
    console.log(financeDocuments);

    // 3. Get all active terms and conditions
    const termsConditions = await TermsCondition.find({ isActive: true }).sort({ order: 1 });

    // 4. Get full model details with branch-specific prices
    const models = await Model.find({
      _id: { $in: selectedModels.map(m => m.model_id) }
    }).populate({
      path: 'prices.header_id',
      select: 'header_key category_key priority metadata'
    });

    if (models.length !== selectedModels.length) {
      return next(new AppError('One or more model IDs are invalid', 400));
    }

    const branchId = creator.branch_id?._id;
    if (!branchId) {
      return next(new AppError('User must be assigned to a branch to create quotations', 400));
    }

    const branch = await Branch.findById(branchId);
    if (!branch) {
      return next(new AppError('Branch not found', 404));
    }

    const modelsWithBranchPrices = models.map(model => {
      const filteredPrices = model.prices.filter(price => 
        price.branch_id && price.branch_id.equals(branchId)
      );
      return {
        ...model.toObject(),
        prices: filteredPrices
      };
    });

    const headers = await Header.find();
    const exShowroomHeader = headers.find(h => 
      h.header_key.toLowerCase().includes('ex-showroom') || 
      h.category_key.toLowerCase().includes('ex-showroom')
    );

    if (!exShowroomHeader) {
      logger.warn('Ex-Showroom price header not found in database');
    }

    const modelIds = models.map(model => model._id);
    const allOffers = await Offer.find({
      isActive: true,
      $or: [
        { applyToAllModels: true },
        { applicableModels: { $in: modelIds } }
      ]
    }).populate('applicableModels', 'model_name');

    const uniqueOffersMap = new Map();
    allOffers.forEach(offer => {
      if (!uniqueOffersMap.has(offer._id.toString())) {
        uniqueOffersMap.set(offer._id.toString(), offer);
      }
    });
    const uniqueOffers = Array.from(uniqueOffersMap.values());

    const allBaseModels = [];
    const responseModels = await Promise.all(modelsWithBranchPrices.map(async model => {
      const exShowroomPrice = exShowroomHeader 
        ? model.prices.find(p => p.header_id._id.equals(exShowroomHeader._id))?.value
        : null;

      const seriesMatch = model.model_name.match(/^([A-Za-z0-9]+)/);
      const series = seriesMatch ? seriesMatch[1] : 'Unknown';

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
          const seriesModelsWithBranchPrices = seriesModels.map(seriesModel => {
            const filteredPrices = seriesModel.prices.filter(price => 
              price.branch_id && price.branch_id.equals(branchId)
            );
            return {
              ...seriesModel.toObject(),
              prices: filteredPrices
            };
          });

          const modelsWithPrices = seriesModelsWithBranchPrices.map(m => {
            const price = exShowroomHeader 
              ? m.prices.find(p => p.header_id._id.equals(exShowroomHeader._id))?.value
              : null;
            return {
              model_id: m._id,
              model_name: m.model_name,
              price: price,
              model: m
            };
          }).filter(m => m.price !== null && m.price !== undefined);
          
          if (modelsWithPrices.length > 0) {
            modelsWithPrices.sort((a, b) => a.price - b.price);
            baseModel = modelsWithPrices[0];
            isBaseModel = baseModel.model_id.toString() === model._id.toString();
            if (!isBaseModel) {
              allBaseModels.push(baseModel);
            }
          }
        }
      }

      const modelOffers = uniqueOffers.filter(offer => 
        offer.applyToAllModels || 
        (offer.applicableModels && offer.applicableModels.some(appModel => 
          appModel && appModel._id && appModel._id.equals(model._id)
        ))
      ).map(offer => ({
        _id: offer._id,
        title: offer.title,
        description: offer.description,
        image: offer.image,
        url: offer.url,
        createdAt: offer.createdAt
      }));

      return {
        selected_model: {
          _id: model._id,
          model_name: model.model_name,
          prices: model.prices.map(p => ({
            value: p.value,
            header_key: p.header_id?.header_key || 'deleted',
            category_key: p.header_id?.category_key || 'deleted',
            priority: p.header_id?.priority || 0,
            metadata: p.header_id?.metadata || {},
            branch_id: p.branch_id || null
          })),
          ex_showroom_price: exShowroomPrice,
          series: series,
          createdAt: model.createdAt,
          is_base_model: isBaseModel,
          offers: modelOffers
        }
      };
    }));

    let finalBaseModel = null;
    const allSelectedAreBaseModels = responseModels.every(m => m.selected_model.is_base_model);
    
    if (!allSelectedAreBaseModels && allBaseModels.length > 0) {
      const uniqueBaseModels = allBaseModels.reduce((acc, current) => {
        const x = acc.find(item => item.model_id.equals(current.model_id));
        if (!x) {
          return acc.concat([current]);
        } else {
          return acc;
        }
      }, []);

      if (uniqueBaseModels.length === 1) {
        finalBaseModel = uniqueBaseModels[0];
      }
    }

    if (finalBaseModel) {
      const isBaseModelSameAsSelected = responseModels.some(m => 
        m.selected_model._id.toString() === finalBaseModel.model_id.toString()
      );
      if (isBaseModelSameAsSelected) {
        finalBaseModel = null;
      }
    }

    // Create the quotation
    const quotation = await Quotation.create({
      customer_id: customer._id,
      models: responseModels.map(m => ({
        model_id: m.selected_model._id,
        model_name: m.selected_model.model_name,
        base_price: m.selected_model.ex_showroom_price || 0
      })),
      base_model_id: finalBaseModel ? finalBaseModel.model_id : null,
      base_model_name: finalBaseModel ? finalBaseModel.model_name : null,
      expected_delivery_date: expected_delivery_date || null,
      finance_needed: finance_needed,
      createdBy: creator._id,
      status: 'draft',
      terms_conditions: termsConditions.map(tc => tc._id)
    });

    // Prepare AllModels array with base model first followed by selected models
    const allModels = [];
    
    // Add base model first if it exists
    if (finalBaseModel) {
      const baseModelDetails = await Model.findById(finalBaseModel.model_id)
        .populate({
          path: 'prices.header_id',
          select: 'header_key category_key priority metadata'
        });

      if (baseModelDetails) {
        const filteredPrices = baseModelDetails.prices.filter(price => 
          price.branch_id && price.branch_id.equals(branchId)
        );

        const exShowroomPrice = exShowroomHeader 
          ? filteredPrices.find(p => p.header_id._id.equals(exShowroomHeader._id))?.value
          : null;

        allModels.push({
          _id: baseModelDetails._id,
          model_name: baseModelDetails.model_name,
          prices: filteredPrices.map(p => ({
            value: p.value,
            header_key: p.header_id?.header_key || 'deleted',
            category_key: p.header_id?.category_key || 'deleted',
            priority: p.header_id?.priority || 0,
            metadata: p.header_id?.metadata || {},
            branch_id: p.branch_id || null
          })),
          ex_showroom_price: exShowroomPrice,
          series: baseModelDetails.model_name.match(/^([A-Za-z0-9]+)/)?.[1] || 'Unknown',
          createdAt: baseModelDetails.createdAt,
          is_base_model: true
        });
      }
    }

    // Add all selected models
    allModels.push(...responseModels.map(model => ({
      _id: model.selected_model._id,
      model_name: model.selected_model.model_name,
      prices: model.selected_model.prices,
      ex_showroom_price: model.selected_model.ex_showroom_price,
      series: model.selected_model.series,
      createdAt: model.selected_model.createdAt,
      is_base_model: model.selected_model.is_base_model
    })));

    // Prepare the final response
    const response = {
      userDetails: {
        _id: creator._id,
        username: creator.username,
        email: creator.email,
        mobile: creator.mobile,
        full_name: creator.full_name,
        branch: branch ? {
          _id: branch._id,
          name: branch.name,
          address: branch.address,
          city: branch.city,
          state: branch.state,
          pincode: branch.pincode,
          phone: branch.phone,
          email: branch.email,
          gst_number: branch.gst_number,
          is_active: branch.is_active
        } : null,
        role: creator.role_id ? {
          _id: creator.role_id._id,
          name: creator.role_id.name,
        } : null
      },
      customerDetails: {
        _id: customer._id,
        name: customer.name,
        address: customer.address,
        taluka: customer.taluka,
        district: customer.district,
        mobile1: customer.mobile1,
        mobile2: customer.mobile2,
        finance_needed: finance_needed,
        createdAt: customer.createdAt
      },
      expected_delivery_date: expected_delivery_date || null,
      AllModels: allModels, // Changed from selectedModels to AllModels with base model first
      financeDocuments: financeDocuments.map(doc => ({
        _id: doc._id,
        name: doc.name,
        isRequired: doc.isRequired,
        description: doc.description || '',
        createdAt: doc.createdAt
      })),
      termsConditions: termsConditions.map(tc => ({
        _id: tc._id,
        title: tc.title,
        content: tc.content,
        order: tc.order
      })),
      quotation_id: quotation._id,
      quotation_number: quotation.quotation_number,
      modelSpecificOffers: responseModels.map(model => ({
        model_id: model.selected_model._id,
        model_name: model.selected_model.model_name,
        offers: model.selected_model.offers.map(offer => ({
          _id: offer._id,
          title: offer.title,
          description: offer.description,
          image: offer.image,
          url: offer.url,
          createdAt: offer.createdAt
        }))
      })),
      allUniqueOffers: uniqueOffers.map(offer => ({
        _id: offer._id,
        title: offer.title,
        description: offer.description,
        image: offer.image,
        url: offer.url,
        createdAt: offer.createdAt,
        applyToAllModels: offer.applyToAllModels,
        applicableModels: offer.applicableModels 
          ? offer.applicableModels.map(model => ({
              _id: model?._id,
              model_name: model?.model_name
            })).filter(m => m._id)
          : []
      }))
    };

    const pdfFileName = `quotation_${quotation.quotation_number}_${Date.now()}.pdf`;
    const pdfDir = path.join(__dirname, '../public/quotations');
    const pdfUrl = `/quotations/${pdfFileName}`;
    
    // Ensure directory exists
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
    
    await pdfGenerator.generateQuotationPDF(response, path.join(pdfDir, pdfFileName));
    
    // Update quotation with relative URL only
    quotation.pdfUrl = pdfUrl;
    await quotation.save({ validateBeforeSave: true });
    
    response.pdfUrl = pdfUrl;

    res.status(200).json({
      status: 'success',
      data: response
    });
  } catch (err) {
    logger.error(`Error in quotation preparation: ${err.message}`);
    next(err);
  }
};


// Add this at the bottom of quotationController.js
// exports.getQuotationPDF = async (req, res, next) => {
//   try {
//     const { filename } = req.params;
    
//     // Validate filename to prevent directory traversal
//     if (!filename || !filename.match(/^quotation_[A-Za-z0-9-]+\.pdf$/)) {
//       return next(new AppError('Invalid filename', 400));
//     }

//     const filePath = path.join(__dirname, `../public/quotations/${filename}`);

//     // Check if file exists
//     if (!fs.existsSync(filePath)) {
//       return next(new AppError('PDF not found', 404));
//     }

//     // Set headers and send file
//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
//     const fileStream = fs.createReadStream(filePath);
//     fileStream.pipe(res);
//   } catch (err) {
//     logger.error(`Error serving PDF file: ${err.message}`);
//     next(err);
//   }
// };

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
// Add this new method to quotationController.js
exports.getQuotationById = async (req, res, next) => {
  try {
    const quotationId = req.params.id;
    
    // Validate quotation ID
    if (!mongoose.Types.ObjectId.isValid(quotationId)) {
      return next(new AppError('Invalid quotation ID', 400));
    }

    // Get the full quotation details with all populated data
    const quotation = await getQuotationDetails(quotationId);
    
    if (!quotation) {
      return next(new AppError('Quotation not found', 404));
    }

    // Get creator details with populated branch
    const creator = await User.findById(quotation.creator._id)
      .populate('branch_id')
      .populate('role_id');

    if (!creator) {
      return next(new AppError('Creator not found', 404));
    }

    // Get customer details
    const customer = quotation.customer;

    // Get all model details with branch-specific prices
    const models = await Model.find({
      _id: { $in: quotation.models.map(m => m.model_id) }
    }).populate({
      path: 'prices.header_id',
      select: 'header_key category_key priority metadata'
    });

    if (models.length !== quotation.models.length) {
      logger.warn('Some models referenced in quotation no longer exist');
    }

    // Filter prices to only include creator's branch prices
    const branchId = creator.branch_id?._id;
    if (!branchId) {
      return next(new AppError('Creator must be assigned to a branch', 400));
    }

    // Get full branch details
    const branch = await Branch.findById(branchId);
    if (!branch) {
      return next(new AppError('Branch not found', 404));
    }

    const modelsWithBranchPrices = models.map(model => {
      const filteredPrices = model.prices.filter(price => 
        price.branch_id && price.branch_id.equals(branchId)
      );
      return {
        ...model.toObject(),
        prices: filteredPrices
      };
    });

    // Find Ex-Showroom header
    const headers = await Header.find();
    const exShowroomHeader = headers.find(h => 
      h.header_key.toLowerCase().includes('ex-showroom') || 
      h.category_key.toLowerCase().includes('ex-showroom')
    );

    // Get all offers (same logic as createQuotation)
    const modelIds = models.map(model => model._id);
    const allOffers = await Offer.find({
      isActive: true,
      $or: [
        { applyToAllModels: true },
        { applicableModels: { $in: modelIds } }
      ]
    }).populate('applicableModels', 'model_name');

    // Remove duplicate offers
    const uniqueOffersMap = new Map();
    allOffers.forEach(offer => {
      if (!uniqueOffersMap.has(offer._id.toString())) {
        uniqueOffersMap.set(offer._id.toString(), offer);
      }
    });
    const uniqueOffers = Array.from(uniqueOffersMap.values());

    // Prepare response models
    const responseModels = await Promise.all(modelsWithBranchPrices.map(async model => {
      // Find Ex-Showroom price
      const exShowroomPrice = exShowroomHeader 
        ? model.prices.find(p => p.header_id._id.equals(exShowroomHeader._id))?.value
        : null;

      // Get series name
      const seriesMatch = model.model_name.match(/^([A-Za-z0-9]+)/);
      const series = seriesMatch ? seriesMatch[1] : 'Unknown';

      // Check if this model is the base model
      const isBaseModel = quotation.base_model_id 
        ? quotation.base_model_id._id.equals(model._id)
        : false;

      // Find offers specific to this model
      const modelOffers = uniqueOffers
        .filter(offer => 
          offer.applyToAllModels || 
          (offer.applicableModels && offer.applicableModels.some(appModel => 
            appModel && appModel._id && appModel._id.equals(model._id)
          )
        ))
        .map(offer => ({
          _id: offer._id,
          title: offer.title,
          description: offer.description,
          image: offer.image,
          url: offer.url,
          createdAt: offer.createdAt
        }));

      return {
        selected_model: {
          _id: model._id,
          model_name: model.model_name,
          prices: model.prices.map(p => ({
            value: p.value,
            header_key: p.header_id?.header_key || 'deleted',
            category_key: p.header_id?.category_key || 'deleted',
            priority: p.header_id?.priority || 0,
            metadata: p.header_id?.metadata || {},
            branch_id: p.branch_id || null
          })),
          ex_showroom_price: exShowroomPrice,
          series: series,
          createdAt: model.createdAt,
          is_base_model: isBaseModel,
          offers: modelOffers
        }
      };
    }));

    // Prepare base model data if it exists
    let baseModelData = null;
    if (quotation.base_model_id) {
      const baseModel = await Model.findById(quotation.base_model_id)
        .populate({
          path: 'prices.header_id',
          select: 'header_key category_key priority metadata'
        });

      if (baseModel) {
        // Filter prices for base model to only include creator's branch prices
        const baseModelWithBranchPrices = {
          ...baseModel.toObject(),
          prices: baseModel.prices.filter(price => 
            price.branch_id && price.branch_id.equals(branchId)
          )
        };

        const exShowroomPrice = exShowroomHeader 
          ? baseModelWithBranchPrices.prices.find(p => p.header_id._id.equals(exShowroomHeader._id))?.value
          : null;

        baseModelData = {
          _id: baseModel._id,
          model_name: baseModel.model_name,
          price: exShowroomPrice,
          prices: baseModelWithBranchPrices.prices.map(p => ({
            value: p.value,
            header_id: {
              _id: p.header_id._id,
              header_key: p.header_id.header_key,
              category_key: p.header_id.category_key
            },
            branch_id: p.branch_id
          })),
          createdAt: baseModel.createdAt,
          __v: baseModel.__v,
          id: baseModel._id
        };
      }
    }

    // Prepare AllModels array with base model first followed by selected models
    const allModels = [];
    if (baseModelData) {
      allModels.push(baseModelData);
    }
    allModels.push(...responseModels.map(model => ({
      _id: model.selected_model._id,
      model_name: model.selected_model.model_name,
      prices: model.selected_model.prices,
      ex_showroom_price: model.selected_model.ex_showroom_price,
      series: model.selected_model.series,
      createdAt: model.selected_model.createdAt,
      is_base_model: model.selected_model.is_base_model
    })));

    // Prepare the final response
    const response = {
      userDetails: {
        _id: creator._id,
        username: creator.username,
        email: creator.email,
        mobile: creator.mobile,
        full_name: creator.full_name,
        branch: branch ? {
          _id: branch._id,
          name: branch.name,
          address: branch.address,
          city: branch.city,
          state: branch.state,
          pincode: branch.pincode,
          phone: branch.phone,
          email: branch.email,
          gst_number: branch.gst_number,
          is_active: branch.is_active
        } : null,
        role: creator.role_id ? {
          _id: creator.role_id._id,
          name: creator.role_id.name,
        } : null
      },
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
      expected_delivery_date: quotation.expected_delivery_date ? 
        new Date(quotation.expected_delivery_date).toISOString().split('T')[0] : 
        null,
      AllModels: allModels,
      quotation_id: quotation._id,
      quotation_number: quotation.quotation_number,
      pdfUrl: quotation.pdfUrl, // Add the pdfUrl to the response
      modelSpecificOffers: responseModels.map(model => ({
        model_id: model.selected_model._id,
        model_name: model.selected_model.model_name,
        offers: model.selected_model.offers
      })),
      allUniqueOffers: uniqueOffers.map(offer => {
        const offerObj = {
          _id: offer._id,
          title: offer.title,
          description: offer.description,
          image: offer.image,
          url: offer.url,
          createdAt: offer.createdAt,
          applyToAllModels: offer.applyToAllModels,
          applicableModels: []
        };

        if (offer.applicableModels && Array.isArray(offer.applicableModels)) {
          offerObj.applicableModels = offer.applicableModels
            .filter(model => model && model._id)
            .map(model => ({
              _id: model._id,
              model_name: model.model_name
            }));
        }

        return offerObj;
      })
    };

    res.status(200).json({
      status: 'success',
      data: response
    });
  } catch (err) {
    logger.error(`Error fetching quotation by ID: ${err.message}`);
    next(err);
  }
};

// Add this at the bottom of quotationController.js
exports.getQuotationPDF = async (req, res, next) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent directory traversal
    if (!filename || !filename.match(/^quotation_[A-Za-z0-9-]+\.pdf$/)) {
      return next(new AppError('Invalid filename', 400));
    }

    const filePath = path.join(__dirname, `../public/quotations/${filename}`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return next(new AppError('PDF not found', 404));
    }

    // Set headers and send file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (err) {
    logger.error(`Error serving PDF file: ${err.message}`);
    next(err);
  }
};



