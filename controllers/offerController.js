const Offer = require('../models/OfferModel');
const Model = require('../models/ModelModel');
const AppError = require('../utils/appError');
const logger = require('../config/logger');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../public/uploads/offers');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `offer-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image')) {
      cb(null, true);
    } else {
      cb(new AppError('Not an image! Please upload only images.', 400), false);
    }
  }
});

exports.uploadOfferImage = upload.single('image');

// Helper function to validate ObjectIds
const validateObjectIds = (ids) => {
  return ids.every(id => mongoose.Types.ObjectId.isValid(id));
};

exports.createOffer = async (req, res, next) => {
  try {
    const { 
      title, 
      description, 
      url,
      isActive = true,
      applyToAllModels = false,
      applicableModels = [] 
    } = req.body;

    // Basic validation
    if (!title || !description) {
      return next(new AppError('Title and description are required', 400));
    }

    // Validate applicable models if not applying to all
    if (!applyToAllModels) {
      if (!applicableModels || applicableModels.length === 0) {
        return next(new AppError('You must specify applicable models or select "apply to all"', 400));
      }

      if (!validateObjectIds(applicableModels)) {
        return next(new AppError('Invalid model IDs provided', 400));
      }

      // Check if models exist
      const existingModels = await Model.countDocuments({ 
        _id: { $in: applicableModels } 
      });
      
      if (existingModels !== applicableModels.length) {
        return next(new AppError('One or more specified models do not exist', 404));
      }
    }

    // Handle image path
    let imagePath = '';
    if (req.file) {
      imagePath = `/uploads/offers/${req.file.filename}`;
    }

    const newOffer = await Offer.create({
      title,
      description,
      url,
      image: imagePath,
      isActive,
      applyToAllModels,
      applicableModels: applyToAllModels ? [] : applicableModels
    });

    res.status(201).json({
      status: 'success',
      data: {
        offer: newOffer
      }
    });
  } catch (err) {
    logger.error(`Error creating offer: ${err.message}`);
    next(err);
  }
};

exports.getAllOffers = async (req, res, next) => {
  try {
    // Filtering
    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
    excludedFields.forEach(el => delete queryObj[el]);

    let query = Offer.find(queryObj);

    // Search functionality
    if (req.query.search) {
      query = query.find({
        $text: {
          $search: req.query.search
        }
      });
    }

    // Sorting
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    // Field limiting
    if (req.query.fields) {
      const fields = req.query.fields.split(',').join(' ');
      query = query.select(fields);
    }

    // Pagination
    const page = req.query.page * 1 || 1;
    const limit = req.query.limit * 1 || 20;
    const skip = (page - 1) * limit;

    query = query.skip(skip).limit(limit);

    // Populate models if needed
    if (req.query.populate === 'true') {
      query = query.populate('applicableModels', 'model_name');
    }

    const offers = await query;

    res.status(200).json({
      status: 'success',
      results: offers.length,
      data: {
        offers
      }
    });
  } catch (err) {
    logger.error(`Error getting offers: ${err.message}`);
    next(err);
  }
};

exports.getOfferById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(new AppError('Invalid offer ID format', 400));
    }

    let query = Offer.findById(req.params.id);

    if (req.query.populate === 'true') {
      query = query.populate('applicableModels', 'model_name');
    }

    const offer = await query;

    if (!offer) {
      return next(new AppError('No offer found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        offer
      }
    });
  } catch (err) {
    logger.error(`Error getting offer by ID: ${err.message}`);
    next(err);
  }
};

exports.updateOffer = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(new AppError('Invalid offer ID format', 400));
    }

    const { 
      title, 
      description, 
      url,
      isActive,
      applyToAllModels,
      applicableModels 
    } = req.body;

    // Check if offer exists
    const existingOffer = await Offer.findById(req.params.id);
    if (!existingOffer) {
      return next(new AppError('No offer found with that ID', 404));
    }

    // Validate applicable models if being updated
    if (applicableModels !== undefined) {
      if (!validateObjectIds(applicableModels)) {
        return next(new AppError('Invalid model IDs provided', 400));
      }

      // Check if models exist
      const existingModels = await Model.countDocuments({ 
        _id: { $in: applicableModels } 
      });
      
      if (existingModels !== applicableModels.length) {
        return next(new AppError('One or more specified models do not exist', 404));
      }
    }

    // Handle image update
    let updateData = {
      title,
      description,
      url,
      isActive,
      applyToAllModels,
      applicableModels: applyToAllModels ? [] : applicableModels,
      updatedAt: new Date()
    };

    if (req.file) {
      // Delete old image if it exists
      if (existingOffer.image) {
        const oldImagePath = path.join(__dirname, '../public', existingOffer.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      updateData.image = `/uploads/offers/${req.file.filename}`;
    }

    const updatedOffer = await Offer.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    ).populate('applicableModels', 'model_name');

    res.status(200).json({
      status: 'success',
      data: {
        offer: updatedOffer
      }
    });
  } catch (err) {
    logger.error(`Error updating offer: ${err.message}`);
    next(err);
  }
};

exports.deleteOffer = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(new AppError('Invalid offer ID format', 400));
    }

    const offer = await Offer.findById(req.params.id);
    
    if (!offer) {
      return next(new AppError('No offer found with that ID', 404));
    }

    // Delete associated image if it exists
    if (offer.image) {
      const imagePath = path.join(__dirname, '../public', offer.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await Offer.findByIdAndDelete(req.params.id);

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    logger.error(`Error deleting offer: ${err.message}`);
    next(err);
  }
};
exports.getOffersForModel = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.modelId)) {
      return next(new AppError('Invalid model ID format', 400));
    }

    // Check if model exists
    const modelExists = await Model.exists({ _id: req.params.modelId });
    if (!modelExists) {
      return next(new AppError('No model found with that ID', 404));
    }

    // Get offers that either apply to all models or include this specific model
    const offers = await Offer.find({
      isActive: true,
      $or: [
        { applyToAllModels: true },
        { applicableModels: req.params.modelId }
      ]
    }).select('title description createdAt');

    res.status(200).json({
      status: 'success',
      results: offers.length,
      data: {
        offers
      }
    });
  } catch (err) {
    logger.error(`Error getting offers for model: ${err.message}`);
    next(err);
  }
};