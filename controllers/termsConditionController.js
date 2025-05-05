const TermsCondition = require('../models/TermsCondition');
const logger = require('../config/logger');

// @desc    Get all terms and conditions
// @route   GET /api/terms-conditions
// @access  Private
exports.getTermsConditions = async (req, res) => {
  try {
    const terms = await TermsCondition.find().sort({ order: 1 });
    res.status(200).json({
      success: true,
      count: terms.length,
      data: terms
    });
  } catch (err) {
    logger.error(`Error getting terms and conditions: ${err.message}`);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get single term and condition
// @route   GET /api/terms-conditions/:id
// @access  Private
exports.getTermsCondition = async (req, res) => {
  try {
    const term = await TermsCondition.findById(req.params.id);
    res.status(200).json({
      success: true,
      data: term
    });
  } catch (err) {
    logger.error(`Error getting term and condition: ${err.message}`);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Create new term and condition
// @route   POST /api/terms-conditions
// @access  Private
exports.createTermsCondition = async (req, res) => {
  try {
    const term = await TermsCondition.create(req.body);
    logger.info(`Term and condition created: ${term.title || 'No title'}`);
    res.status(201).json({
      success: true,
      data: term
    });
  } catch (err) {
    logger.error(`Error creating term and condition: ${err.message}`);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Update term and condition
// @route   PUT /api/terms-conditions/:id
// @access  Private
exports.updateTermsCondition = async (req, res) => {
  try {
    const term = await TermsCondition.findByIdAndUpdate(req.params.id, req.body, {
      new: true
    });
    logger.info(`Term and condition updated: ${term.title || 'No title'}`);
    res.status(200).json({
      success: true,
      data: term
    });
  } catch (err) {
    logger.error(`Error updating term and condition: ${err.message}`);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Delete term and condition
// @route   DELETE /api/terms-conditions/:id
// @access  Private
exports.deleteTermsCondition = async (req, res) => {
  try {
    await TermsCondition.findByIdAndDelete(req.params.id);
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    logger.error(`Error deleting term and condition: ${err.message}`);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};