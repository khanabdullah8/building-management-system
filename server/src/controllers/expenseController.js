const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Building = require('../models/Building');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const expensePopulation = { path: 'building', select: 'name code' };

const VALID_CATEGORIES = ['maintenance', 'utilities', 'housekeeping', 'security', 'landscaping', 'admin', 'other'];
const VALID_STATUSES = ['pending', 'approved', 'rejected'];

const validateBuilding = async (buildingId) => {
  if (!mongoose.Types.ObjectId.isValid(buildingId)) {
    throw new ApiError(400, 'Invalid building ID format', { building: 'Invalid building ID format' });
  }

  const building = await Building.findById(buildingId);
  if (!building) {
    throw new ApiError(400, 'Referenced building does not exist', { building: 'Referenced building does not exist' });
  }
};

const getExpenses = asyncHandler(async (req, res) => {
  const { search, building, status, category } = req.query;
  const filter = {};

  if (building) {
    if (!mongoose.Types.ObjectId.isValid(building)) {
      return sendSuccess(res, []);
    }
    filter.building = building;
  }

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return sendSuccess(res, []);
    }
    filter.status = status;
  }

  if (category) {
    if (!VALID_CATEGORIES.includes(category)) {
      return sendSuccess(res, []);
    }
    filter.category = category;
  }

  if (search) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escaped, 'i');

    filter.$or = [
      { category: searchRegex },
      { description: searchRegex },
    ];
  }

  const expenses = await Expense.find(filter)
    .populate(expensePopulation)
    .sort({ date: -1 });

  return sendSuccess(res, expenses);
});

const getExpenseById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Expense not found');
  }

  const expense = await Expense.findById(id).populate(expensePopulation);

  if (!expense) {
    throw new ApiError(404, 'Expense not found');
  }

  return sendSuccess(res, expense);
});

const createExpense = asyncHandler(async (req, res) => {
  const { category, building: buildingId, description, amount, date, status } = req.body;

  if (!category || typeof category !== 'string' || !category.trim()) {
    throw new ApiError(400, 'Expense category is required', { category: 'Expense category is required' });
  }

  if (!VALID_CATEGORIES.includes(category.trim())) {
    throw new ApiError(400, 'Category must be one of: maintenance, utilities, housekeeping, security, landscaping, admin, other', {
      category: 'Invalid expense category',
    });
  }

  if (!buildingId) {
    throw new ApiError(400, 'Building ID is required', { building: 'Building ID is required' });
  }

  await validateBuilding(buildingId);

  if (amount === undefined || amount === null) {
    throw new ApiError(400, 'Amount is required', { amount: 'Amount is required' });
  }

  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new ApiError(400, 'Amount must be a number', { amount: 'Amount must be a number' });
  }

  if (amount <= 0) {
    throw new ApiError(400, 'Amount must be greater than 0', { amount: 'Amount must be greater than 0' });
  }

  if (date !== undefined && date !== null) {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      throw new ApiError(400, 'Invalid date format', { date: 'Invalid date format' });
    }
  }

  if (status !== undefined && status !== null) {
    if (!VALID_STATUSES.includes(status)) {
      throw new ApiError(400, 'Status must be pending, approved, or rejected', { status: 'Invalid expense status' });
    }
  }

  if (description !== undefined && typeof description !== 'string') {
    throw new ApiError(400, 'Description must be a string', { description: 'Description must be a string' });
  }

  const expense = await Expense.create({
    category: category.trim(),
    building: buildingId,
    description: description !== undefined ? description.trim() : '',
    amount,
    date: date ? new Date(date) : new Date(),
    status: status || 'pending',
  });

  await expense.populate(expensePopulation);
  return sendSuccess(res, expense, 'Expense created successfully', null, 201);
});

const updateExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Expense not found');
  }

  const expense = await Expense.findById(id);
  if (!expense) {
    throw new ApiError(404, 'Expense not found');
  }

  const { category, description, amount, date, status } = req.body;

  if (category !== undefined) {
    if (typeof category !== 'string' || !category.trim()) {
      throw new ApiError(400, 'Expense category cannot be empty', { category: 'Expense category cannot be empty' });
    }
    if (!VALID_CATEGORIES.includes(category.trim())) {
      throw new ApiError(400, 'Category must be one of: maintenance, utilities, housekeeping, security, landscaping, admin, other', {
        category: 'Invalid expense category',
      });
    }
    expense.category = category.trim();
  }

  if (amount !== undefined) {
    if (typeof amount !== 'number' || isNaN(amount)) {
      throw new ApiError(400, 'Amount must be a number', { amount: 'Amount must be a number' });
    }
    if (amount <= 0) {
      throw new ApiError(400, 'Amount must be greater than 0', { amount: 'Amount must be greater than 0' });
    }
    expense.amount = amount;
  }

  if (date !== undefined) {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      throw new ApiError(400, 'Invalid date format', { date: 'Invalid date format' });
    }
    expense.date = parsed;
  }

  if (description !== undefined) {
    if (typeof description !== 'string') {
      throw new ApiError(400, 'Description must be a string', { description: 'Description must be a string' });
    }
    expense.description = description.trim();
  }

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      throw new ApiError(400, 'Status must be pending, approved, or rejected', { status: 'Invalid expense status' });
    }
    expense.status = status;
  }

  const updatedExpense = await expense.save();
  await updatedExpense.populate(expensePopulation);
  return sendSuccess(res, updatedExpense, 'Expense updated successfully');
});

const deleteExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Expense not found');
  }

  const expense = await Expense.findByIdAndDelete(id);
  if (!expense) {
    throw new ApiError(404, 'Expense not found');
  }

  return sendSuccess(res, null, 'Expense deleted successfully');
});

module.exports = {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
};
