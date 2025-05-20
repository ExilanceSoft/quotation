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
const Attachment = require('../models/AttachmentModel');


const getUniqueAttachmentsForModels = async (modelIds) => {
  const attachments = await Attachment.find({
    $or: [
      { isForAllModels: true },
      { applicableModels: { $in: modelIds } }
    ]
  })
  .populate('createdBy', 'name email')
  .populate('applicableModels', 'model_name');

  const uniqueAttachmentsMap = new Map();
  attachments.forEach(attachment => {
    if (!uniqueAttachmentsMap.has(attachment._id.toString())) {
      uniqueAttachmentsMap.set(attachment._id.toString(), attachment);
    }
  });

  return Array.from(uniqueAttachmentsMap.values());
};

const prepareAttachmentResponse = (attachments) => {
  return attachments.map(attachment => ({
    _id: attachment._id,
    title: attachment.title,
    description: attachment.description,
    isForAllModels: attachment.isForAllModels,
    applicableModels: attachment.isForAllModels 
      ? []
      : attachment.applicableModels.map(model => ({
          _id: model._id,
          model_name: model.model_name
        })),
    attachments: attachment.attachments.map(item => ({
      type: item.type,
      url: item.url,
      content: item.content,
      thumbnail: item.thumbnail
    })),
    createdBy: {
      _id: attachment.createdBy._id,
      name: attachment.createdBy.name,
      email: attachment.createdBy.email
    },
    createdAt: attachment.createdAt
  }));
};

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
      finance_needed = false
    } = req.body;

    const creator = req.user;

    if (!customerDetails || !selectedModels || !Array.isArray(selectedModels)) {
      return next(new AppError('Missing required fields or invalid data format', 400));
    }

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

    const financeDocuments = await FinanceDocument.find({}).sort({ createdAt: 1 });
    const termsConditions = await TermsCondition.find({ isActive: true }).sort({ order: 1 });

    const models = await Model.find({
      _id: { $in: selectedModels.map(m => m.model_id) }
    }).populate({
      path: 'prices.header_id',
      select: 'header_key category_key priority metadata'
    });

    if (models.length !== selectedModels.length) {
      return next(new AppError('One or more model IDs are invalid', 400));
    }

    const modelIds = models.map(model => model._id);
    const attachments = await getUniqueAttachmentsForModels(modelIds);

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
        )
      ).map(offer => ({
        _id: offer._id,
        title: offer.title,
        description: offer.description,
        image: offer.image,
        url: offer.url,
        createdAt: offer.createdAt
      })));

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

    const allModels = [];
    
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

    allModels.push(...responseModels.map(model => ({
      _id: model.selected_model._id,
      model_name: model.selected_model.model_name,
      prices: model.selected_model.prices,
      ex_showroom_price: model.selected_model.ex_showroom_price,
      series: model.selected_model.series,
      createdAt: model.selected_model.createdAt,
      is_base_model: model.selected_model.is_base_model
    })));

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
      AllModels: allModels,
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
      attachments: prepareAttachmentResponse(attachments),
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
    
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
    
    await pdfGenerator.generateQuotationPDF(response, path.join(pdfDir, pdfFileName));
    
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
    let query = {};
    
    // If user is not super admin, only show their own quotations
    if (req.user.role_id.name !== 'super_admin') {
      query.createdBy = req.user._id;
    }

    const quotations = await Quotation.find(query)
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
    
    if (!mongoose.Types.ObjectId.isValid(quotationId)) {
      return next(new AppError('Invalid quotation ID', 400));
    }

    const quotation = await getQuotationDetails(quotationId);
    
    if (!quotation) {
      return next(new AppError('Quotation not found', 404));
    }

    const creator = await User.findById(quotation.creator._id)
      .populate('branch_id')
      .populate('role_id');

    if (!creator) {
      return next(new AppError('Creator not found', 404));
    }

    const customer = quotation.customer;

    const models = await Model.find({
      _id: { $in: quotation.models.map(m => m.model_id) }
    }).populate({
      path: 'prices.header_id',
      select: 'header_key category_key priority metadata'
    });

    const modelIds = models.map(model => model._id);
    const attachments = await getUniqueAttachmentsForModels(modelIds);

    const branchId = creator.branch_id?._id;
    if (!branchId) {
      return next(new AppError('Creator must be assigned to a branch', 400));
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

    const responseModels = await Promise.all(modelsWithBranchPrices.map(async model => {
      const exShowroomPrice = exShowroomHeader 
        ? model.prices.find(p => p.header_id._id.equals(exShowroomHeader._id))?.value
        : null;

      const seriesMatch = model.model_name.match(/^([A-Za-z0-9]+)/);
      const series = seriesMatch ? seriesMatch[1] : 'Unknown';

      const isBaseModel = quotation.base_model_id 
        ? quotation.base_model_id._id.equals(model._id)
        : false;

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

    let baseModelData = null;
    if (quotation.base_model_id) {
      const baseModel = await Model.findById(quotation.base_model_id)
        .populate({
          path: 'prices.header_id',
          select: 'header_key category_key priority metadata'
        });

      if (baseModel) {
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
      attachments: prepareAttachmentResponse(attachments),
      quotation_id: quotation._id,
      quotation_number: quotation.quotation_number,
      pdfUrl: quotation.pdfUrl,
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

exports.getTodaysQuotationCount = async (req, res, next) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    let query = {
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    };
    
    // If user is not super admin, only count their own quotations
    if (req.user.role_id.name !== 'super_admin') {
      query.createdBy = req.user._id;
    }

    const count = await Quotation.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        count
      }
    });
  } catch (err) {
    next(err);
  }
};

// Get this month's quotation count
exports.getThisMonthQuotationCount = async (req, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    let query = {
      createdAt: {
        $gte: startOfMonth,
        $lte: endOfMonth
      }
    };
    
    // If user is not super admin, only count their own quotations
    if (req.user.role_id.name !== 'super_admin') {
      query.createdBy = req.user._id;
    }

    const count = await Quotation.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        count
      }
    });
  } catch (err) {
    next(err);
  }
};



