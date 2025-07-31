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
const ExcelJS = require('exceljs');
const axios = require('axios');
const FormData = require('form-data');

const WHATSAPP_API_URL = 'https://crmapi.digidonar.in/api/meta/v19.0/692849710580259/messages';
const ACCESS_TOKEN = 'Ia13ovnsbYJ18zYTIfdVU5ERVJTQ09SRQ736y9UaLu32VU5ERVJTQ09SRQ545gO8647MVU5ERVJTQ09SRQnuGb5quI1SJYqyE6TseOwzV2SbVe9Ecf146ZYMglRdI6be7rzgA6T5wVsUCjEcS8PvFqKxMAYPOfKJmI';

async function sendWhatsAppMessage(to, pdfUrl) {
  try {
    const payload = {
      to,
      recipient_type: 'individual',
      type: 'template',
      template: {
        language: {
          policy: 'deterministic',
          code: 'en',
        },
        name: 'quotation_pdf', // Your approved template name
        components: [
          {
            type: 'header',
            parameters: [
              {
                type: 'document',
                document: {
                  link: pdfUrl
                }
              }
            ]
          },
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: new Date().toLocaleDateString('en-IN') // Current date
              }
            ]
          }
        ]
      }
    };

    const response = await axios.post(WHATSAPP_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    return {
      success: true,
      messageId: response.data?.messages?.[0]?.id,
      timestamp: response.data?.meta?.timestamp
    };
  } catch (error) {
    logger.error(`WhatsApp API error: ${error.message}`);
    throw new AppError('Failed to send WhatsApp message', 500);
  }
}

exports.sendQuotationViaWhatsApp = async (req, res, next) => {
  try {
    const { quotationId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(quotationId)) {
      return next(new AppError('Invalid quotation ID', 400));
    }

    // Get the quotation - no need to populate since we have embedded customerDetails
    const quotation = await Quotation.findById(quotationId);

    if (!quotation) {
      return next(new AppError('Quotation not found', 404));
    }

    // Check if PDF exists
    if (!quotation.pdfUrl) {
      return next(new AppError('PDF not generated for this quotation', 400));
    }

    // Get mobile number from embedded customerDetails
    const mobileNumber = quotation.customerDetails?.mobile1;
    if (!mobileNumber || !/^[0-9]{10}$/.test(mobileNumber)) {
      return next(new AppError('Invalid customer mobile number', 400));
    }

    // Construct full PDF URL
    const fullPdfUrl = `${req.protocol}://${req.get('host')}${quotation.pdfUrl}`;

    // Send via WhatsApp
    const whatsappResponse = await sendWhatsAppMessage(`91${mobileNumber}`, fullPdfUrl);

    // Update quotation with sent status
    quotation.status = 'sent';
    quotation.sentViaWhatsApp = {
      sent: true,
      sentAt: new Date(),
      sentBy: userId,
      messageId: whatsappResponse.messageId,
      timestamp: whatsappResponse.timestamp
    };
    await quotation.save();

    res.status(200).json({
      status: 'success',
      message: 'Quotation sent successfully via WhatsApp',
      data: {
        quotationId: quotation._id,
        customerName: quotation.customerDetails?.name,
        mobileNumber,
        pdfUrl: fullPdfUrl,
        whatsappResponse
      }
    });

  } catch (err) {
    logger.error(`Error sending quotation via WhatsApp: ${err.message}`);
    next(err);
  }
};

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
    .populate('termsConditions')
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

    const allModels = [];
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
              allModels.push(baseModel);
            }
          }
        }
      }

      const modelOffers = uniqueOffers
        .filter(offer =>
          offer.applyToAllModels ||
          (offer.applicableModels && offer.applicableModels.some(appModel =>
            appModel && appModel._id && appModel._id.equals(model._id)
          ))
        )
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

    let finalBaseModel = null;
    const allSelectedAreBaseModels = responseModels.every(m => m.selected_model.is_base_model);

    if (!allSelectedAreBaseModels && allModels.length > 0) {
      const uniqueBaseModels = allModels.reduce((acc, current) => {
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

    const completeAllModels = [];

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

        completeAllModels.push({
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

    completeAllModels.push(...responseModels.map(model => ({
      _id: model.selected_model._id,
      model_name: model.selected_model.model_name,
      prices: model.selected_model.prices,
      ex_showroom_price: model.selected_model.ex_showroom_price,
      series: model.selected_model.series,
      createdAt: model.selected_model.createdAt,
      is_base_model: model.selected_model.is_base_model
    })));

    // Create the quotation first
    const quotation = await Quotation.create({
      customer_id: customer._id,
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
      models: responseModels.map(m => ({
        model_id: m.selected_model._id,
        model_name: m.selected_model.model_name,
        base_price: m.selected_model.ex_showroom_price || 0,
        prices: m.selected_model.prices,
        ex_showroom_price: m.selected_model.ex_showroom_price,
        series: m.selected_model.series,
        is_base_model: m.selected_model.is_base_model,
        offers: m.selected_model.offers
      })),
      base_model_id: finalBaseModel ? finalBaseModel.model_id : null,
      base_model_name: finalBaseModel ? finalBaseModel.model_name : null,
      expected_delivery_date: expected_delivery_date || null,
      finance_needed: finance_needed,
      createdBy: creator._id,
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
      AllModels: completeAllModels,
      financeDocuments: financeDocuments.map(doc => ({
        _id: doc._id,
        name: doc.name,
        isRequired: doc.isRequired,
        description: doc.description || '',
        createdAt: doc.createdAt
      })),
      terms_conditions: termsConditions.map(tc => tc._id),
      termsConditions: termsConditions.map(tc => ({
        _id: tc._id,
        title: tc.title,
        content: tc.content,
        order: tc.order
      })),
      attachments: prepareAttachmentResponse(attachments),
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
      })),
      status: 'draft'
    });

    // Now generate PDF with the created quotation
    const pdfFileName = `quotation_${quotation.quotation_number}_${Date.now()}.pdf`;
    const pdfDir = path.join(__dirname, '../public/quotations');
    const pdfUrl = `/quotations/${pdfFileName}`;

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    await pdfGenerator.generateQuotationPDF({
      ...quotation.toObject(),
      pdfUrl: pdfUrl
    }, path.join(pdfDir, pdfFileName));

    // Update quotation with PDF URL
    quotation.pdfUrl = pdfUrl;
    await quotation.save({ validateBeforeSave: true });

    res.status(200).json({
      status: 'success',
      data: {
        ...quotation.toObject(),
        pdfUrl: pdfUrl
      }
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
    if (req.user.role_id?.name !== 'super_admin') {
      query.createdBy = req.user._id;
    }

    const quotations = await Quotation.find(query)
      .populate('customer', 'name mobile1 address taluka district')
      .populate({
        path: 'creator',
        select: 'full_name email mobile',
        populate: {
          path: 'branch_id',
          select: 'name city'
        }
      })
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
      })
      .sort({ createdAt: -1 });

    // Get branch ID for price filtering
    const branchId = req.user.branch_id?._id;

    // Get ex-showroom header for price reference
    const headers = await Header.find();
    const exShowroomHeader = headers.find(h =>
      h.header_key?.toLowerCase().includes('ex-showroom') ||
      h.category_key?.toLowerCase().includes('ex-showroom')
    );

    // Format the response with complete model information
    const formattedQuotations = await Promise.all(quotations.map(async (quotation) => {
      // Process models with branch-specific prices
      const modelsWithDetails = await Promise.all(quotation.models.map(async (modelItem) => {
        if (!modelItem.model_id) {
          return {
            _id: modelItem._id,
            model_name: 'Deleted Model',
            prices: [],
            ex_showroom_price: 0,
            base_price: modelItem.base_price,
            series: 'Unknown'
          };
        }

        const model = modelItem.model_id;

        // Filter prices for the user's branch
        const filteredPrices = (model.prices || []).filter(price =>
          price?.branch_id && price.branch_id.equals(branchId)
        );

        // Get ex-showroom price
        const exShowroomPrice = exShowroomHeader
          ? filteredPrices.find(p => p?.header_id?._id?.equals(exShowroomHeader._id))?.value
          : null;

        return {
          _id: model._id,
          model_name: model.model_name,
          prices: filteredPrices.map(p => ({
            value: p.value,
            header_key: p.header_id?.header_key || 'deleted',
            category_key: p.header_id?.category_key || 'deleted',
            priority: p.header_id?.priority || 0,
            metadata: p.header_id?.metadata || {},
            branch_id: p.branch_id || null
          })),
          ex_showroom_price: exShowroomPrice,
          base_price: modelItem.base_price,
          series: model.model_name?.match(/^([A-Za-z0-9]+)/)?.[1] || 'Unknown'
        };
      }));

      // Process base model if exists
      let baseModelWithDetails = null;
      if (quotation.base_model_id) {
        const baseModel = quotation.base_model_id;
        const filteredPrices = (baseModel.prices || []).filter(price =>
          price?.branch_id && price.branch_id.equals(branchId)
        );

        const exShowroomPrice = exShowroomHeader
          ? filteredPrices.find(p => p?.header_id?._id?.equals(exShowroomHeader._id))?.value
          : null;

        baseModelWithDetails = {
          _id: baseModel._id,
          model_name: baseModel.model_name,
          prices: filteredPrices.map(p => ({
            value: p.value,
            header_key: p.header_id?.header_key || 'deleted',
            category_key: p.header_id?.category_key || 'deleted',
            priority: p.header_id?.priority || 0,
            metadata: p.header_id?.metadata || {},
            branch_id: p.branch_id || null
          })),
          ex_showroom_price: exShowroomPrice,
          series: baseModel.model_name?.match(/^([A-Za-z0-9]+)/)?.[1] || 'Unknown'
        };
      }

      return {
        _id: quotation._id,
        quotation_number: quotation.quotation_number,
        status: quotation.status,
        createdAt: quotation.createdAt,
        expected_delivery_date: quotation.expected_delivery_date,
        finance_needed: quotation.finance_needed,
        pdfUrl: quotation.pdfUrl,
        customer: quotation.customer ? {
          _id: quotation.customer._id,
          name: quotation.customer.name,
          mobile1: quotation.customer.mobile1,
          address: quotation.customer.address,
          taluka: quotation.customer.taluka,
          district: quotation.customer.district
        } : null,
        creator: quotation.creator ? {
          _id: quotation.creator._id,
          name: quotation.creator.full_name,
          email: quotation.creator.email,
          mobile: quotation.creator.mobile,
          branch: quotation.creator.branch_id ? {
            _id: quotation.creator.branch_id._id,
            name: quotation.creator.branch_id.name,
            city: quotation.creator.branch_id.city
          } : null
        } : null,
        models: modelsWithDetails,
        base_model: baseModelWithDetails
      };
    }));

    res.status(200).json({
      status: 'success',
      results: formattedQuotations.length,
      data: {
        quotations: formattedQuotations
      }
    });
  } catch (err) {
    logger.error(`Error fetching all quotations: ${err.message}`);
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

exports.exportQuotationsToExcel = async (req, res, next) => {
  try {
    // Extract and validate query parameters
    const { startDate, endDate, branchId } = req.query;
    
    // Helper function to parse date in YYYY-MM-DD format and set to start of day in local time
    const parseStartDate = (dateString) => {
      if (!dateString) return null;
      const parts = dateString.split('-');
      if (parts.length !== 3) return null;
      return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
    };

    // Helper function to parse date in YYYY-MM-DD format and set to end of day in local time
    const parseEndDate = (dateString) => {
      if (!dateString) return null;
      const parts = dateString.split('-');
      if (parts.length !== 3) return null;
      return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
    };

    const startDateObj = parseStartDate(startDate);
    const endDateObj = parseEndDate(endDate);

    if (startDate && !startDateObj) {
      return next(new AppError('Invalid start date format. Use YYYY-MM-DD.', 400));
    }
    if (endDate && !endDateObj) {
      return next(new AppError('Invalid end date format. Use YYYY-MM-DD.', 400));
    }
    if (startDateObj && endDateObj && startDateObj > endDateObj) {
      return next(new AppError('Start date cannot be after end date', 400));
    }
    if (branchId && !mongoose.Types.ObjectId.isValid(branchId)) {
      return next(new AppError('Invalid branch ID', 400));
    }

    // Build query
    let query = {};
    
    // Date range filter
    if (startDateObj || endDateObj) {
      query.createdAt = {};
      if (startDateObj) query.createdAt.$gte = startDateObj;
      if (endDateObj) query.createdAt.$lte = endDateObj;
    }
    
    // Branch filter
    if (branchId) {
      // Find users in this branch
      const branchUsers = await User.find({ branch_id: branchId }).select('_id');
      const userIds = branchUsers.map(user => user._id);
      query.createdBy = { $in: userIds };
    } else if (req.user.role_id?.name !== 'super_admin') {
      // Non-admin users can only see their own quotations
      query.createdBy = req.user._id;
    }

    // Fetch quotations with necessary data
    const quotations = await Quotation.find(query)
      .populate('customer', 'name mobile1 address taluka district')
      .populate({
        path: 'creator',
        select: 'full_name',
        populate: { path: 'branch_id', select: 'name city' }
      })
      .populate('base_model_id', 'model_name')
      .sort({ createdAt: -1 });

    if (quotations.length === 0) {
      return next(new AppError('No quotations found', 404));
    }

    // Get branch name for filename if branch filter is applied
    let branchName = '';
    if (branchId) {
      const branch = await Branch.findById(branchId).select('name');
      branchName = branch ? `_${branch.name.replace(/\s+/g, '_')}` : '';
    }

    // Generate filename
    let filename = 'quotations';
    if (branchName) filename += branchName;
    if (startDate && endDate) {
      filename += `_${startDate}_to_${endDate}`;
    } else if (startDate) {
      filename += `_from_${startDate}`;
    } else if (endDate) {
      filename += `_until_${endDate}`;
    } else {
      const today = new Date();
      filename += `_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Quotations');

    // First, collect all unique category_key and header_key combinations
    const allPriceHeaders = new Set();
    const priceHeaderMap = new Map(); // To store {header_key: {category_key, priority}}

    for (const quotation of quotations) {
      for (const model of quotation.models) {
        for (const price of model.prices) {
          const headerKey = price.header_key || 'Unknown';
          const categoryKey = price.category_key || 'Unknown';
          const combinedKey = `${categoryKey}||${headerKey}`;

          allPriceHeaders.add(combinedKey);

          if (!priceHeaderMap.has(combinedKey)) {
            priceHeaderMap.set(combinedKey, {
              category_key: categoryKey,
              header_key: headerKey,
              priority: price.priority || 0
            });
          }
        }
      }
    }

    // Convert Set to Array and sort by priority
    const sortedPriceHeaders = Array.from(allPriceHeaders).sort((a, b) => {
      const aData = priceHeaderMap.get(a);
      const bData = priceHeaderMap.get(b);
      return (aData.priority || 0) - (bData.priority || 0);
    });

    // Define base columns
    const baseColumns = [
      { header: 'Quotation No.', key: 'quotation_number', width: 20 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Customer Name', key: 'customer_name', width: 25 },
      { header: 'Mobile', key: 'mobile', width: 15 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Created By', key: 'created_by', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Finance Needed', key: 'finance_needed', width: 15 },
      { header: 'Expected Delivery', key: 'expected_delivery', width: 20 },
      { header: 'Base Model', key: 'base_model', width: 25 },
      { header: 'Selected Models', key: 'selected_models', width: 40 }
    ];

    // Add price columns
    const priceColumns = sortedPriceHeaders.map(combinedKey => {
      const { category_key, header_key } = priceHeaderMap.get(combinedKey);
      return {
        header: `${category_key} - ${header_key}`,
        key: combinedKey,
        width: 20,
        style: { numFmt: '₹#,##0.00' }
      };
    });

    // Add total columns
    const totalColumns = [
      { header: 'Total Ex-Showroom', key: 'total_ex_showroom', width: 20, style: { numFmt: '₹#,##0.00' } },
      { header: 'Total On-Road Price', key: 'total_price', width: 20, style: { numFmt: '₹#,##0.00' } }
    ];

    // Combine all columns
    sheet.columns = [...baseColumns, ...priceColumns, ...totalColumns];

    // Style header row
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Process each quotation
    for (const quotation of quotations) {
      const customer = quotation.customer || {};
      const branch = quotation.creator?.branch_id || {};

      // Format dates
      const date = new Date(quotation.date || quotation.createdAt).toLocaleDateString('en-IN');
      const expectedDelivery = quotation.expected_delivery_date
        ? new Date(quotation.expected_delivery_date).toLocaleDateString('en-IN')
        : 'N/A';

      // Get all model names
      const baseModel = quotation.base_model_id?.model_name || 'N/A';
      const selectedModels = quotation.models.map(m => m.model_name).join(', ');

      // Calculate totals
      const totalExShowroom = quotation.models.reduce((sum, model) => sum + (model.ex_showroom_price || 0), 0);
      const totalOnRoad = quotation.models.reduce((sum, model) => {
        const modelTotal = model.prices.reduce((mSum, price) => mSum + (price.value || 0), 0);
        return sum + modelTotal;
      }, 0);

      // Create a map of all price values for this quotation
      const priceValues = new Map();
      for (const model of quotation.models) {
        for (const price of model.prices) {
          const headerKey = price.header_key || 'Unknown';
          const categoryKey = price.category_key || 'Unknown';
          const combinedKey = `${categoryKey}||${headerKey}`;

          // Sum values if the same header appears multiple times (across models)
          const currentValue = priceValues.get(combinedKey) || 0;
          priceValues.set(combinedKey, currentValue + (price.value || 0));
        }
      }

      // Prepare the row data
      const rowData = {
        quotation_number: quotation.quotation_number,
        date: date,
        customer_name: customer.name,
        mobile: customer.mobile1,
        branch: `${branch.name}${branch.city ? `, ${branch.city}` : ''}`,
        created_by: quotation.creator?.full_name || 'N/A',
        status: quotation.status.charAt(0).toUpperCase() + quotation.status.slice(1),
        finance_needed: quotation.finance_needed ? 'Yes' : 'No',
        expected_delivery: expectedDelivery,
        base_model: baseModel,
        selected_models: selectedModels,
        total_ex_showroom: totalExShowroom,
        total_price: totalOnRoad
      };

      // Add all price values to the row data
      for (const [combinedKey, value] of priceValues.entries()) {
        rowData[combinedKey] = value;
      }

      // Add the row to the sheet
      const row = sheet.addRow(rowData);

      // Apply alternate row coloring
      if (row.number % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        });
      }
    }

    // Auto-fit columns
    sheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const cellLength = cell.value ? cell.value.toString().length : 0;
        if (cellLength > maxLength) maxLength = cellLength;
      });
      column.width = Math.min(Math.max(maxLength + 2, column.header.length + 2), 50);
    });

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);

    // Send the file
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    logger.error(`Excel export error: ${err.message}`, { stack: err.stack });
    next(new AppError('Failed to generate export. Please try again.', 500));
  }
};