const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const Unit = require('../models/Unit');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const billPopulation = {
  path: 'unit',
  populate: { path: 'building', select: 'name code' },
};

const VALID_STATUSES = ['pending', 'paid', 'overdue'];

const validateUnit = async (unitId) => {
  if (!mongoose.Types.ObjectId.isValid(unitId)) {
    throw new ApiError(400, 'Invalid unit ID format', { unit: 'Invalid unit ID format' });
  }

  const unit = await Unit.findById(unitId);
  if (!unit) {
    throw new ApiError(400, 'Referenced unit does not exist', { unit: 'Referenced unit does not exist' });
  }
};

const managePaidAt = (bill, newStatus) => {
  if (newStatus === 'paid') {
    if (!bill.paidAt) {
      bill.paidAt = new Date();
    }
  } else {
    bill.paidAt = null;
  }
};

const getBills = asyncHandler(async (req, res) => {
  const { search, building, status } = req.query;
  const filter = {};

  if (building) {
    if (!mongoose.Types.ObjectId.isValid(building)) {
      return sendSuccess(res, []);
    }
    const unitIds = await Unit.find({ building }).select('_id');
    filter.unit = { $in: unitIds.map((u) => u._id) };
  }

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return sendSuccess(res, []);
    }
    filter.status = status;
  }

  if (search) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escaped, 'i');

    filter.$or = [
      { billNo: searchRegex },
      { period: searchRegex },
      { description: searchRegex },
    ];
  }

  const bills = await Bill.find(filter)
    .populate(billPopulation)
    .sort({ createdAt: -1 });

  return sendSuccess(res, bills);
});

const getBillById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Bill not found');
  }

  const bill = await Bill.findById(id).populate(billPopulation);

  if (!bill) {
    throw new ApiError(404, 'Bill not found');
  }

  return sendSuccess(res, bill);
});

const createBill = asyncHandler(async (req, res) => {
  const { unit: unitId, period, amount, description, dueDate, billNo } = req.body;

  if (!unitId) {
    throw new ApiError(400, 'Unit ID is required', { unit: 'Unit ID is required' });
  }

  await validateUnit(unitId);

  if (!period || typeof period !== 'string' || !period.trim()) {
    throw new ApiError(400, 'Billing period is required', { period: 'Billing period is required' });
  }

  if (amount === undefined || amount === null) {
    throw new ApiError(400, 'Amount is required', { amount: 'Amount is required' });
  }

  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new ApiError(400, 'Amount must be a number', { amount: 'Amount must be a number' });
  }

  if (amount <= 0) {
    throw new ApiError(400, 'Amount must be greater than 0', { amount: 'Amount must be greater than 0' });
  }

  if (description !== undefined && typeof description !== 'string') {
    throw new ApiError(400, 'Description must be a string', { description: 'Description must be a string' });
  }

  if (dueDate !== undefined && dueDate !== null) {
    const parsed = new Date(dueDate);
    if (isNaN(parsed.getTime())) {
      throw new ApiError(400, 'Invalid due date format', { dueDate: 'Invalid due date format' });
    }
  }

  const billData = {
    unit: unitId,
    period: period.trim(),
    amount,
    description: description !== undefined ? description.trim() : '',
    dueDate: dueDate ? new Date(dueDate) : null,
    status: 'pending',
    paidAt: null,
  };

  if (billNo !== undefined && billNo !== null) {
    if (typeof billNo !== 'string' || !billNo.trim()) {
      throw new ApiError(400, 'Bill number must be a non-empty string', { billNo: 'Bill number must be a non-empty string' });
    }
    billData.billNo = billNo.trim();
  }

  let bill;
  try {
    bill = await Bill.create(billData);
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(400, 'A bill with this bill number already exists', { billNo: 'Bill number already exists' });
    }
    throw err;
  }

  await bill.populate(billPopulation);
  return sendSuccess(res, bill, 'Bill created successfully', null, 201);
});

const updateBill = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Bill not found');
  }

  const bill = await Bill.findById(id);
  if (!bill) {
    throw new ApiError(404, 'Bill not found');
  }

  const { billNo, unit, period, amount, description, status, dueDate } = req.body;

  if (billNo !== undefined) {
    throw new ApiError(400, 'Bill number cannot be changed', { billNo: 'Bill number cannot be changed' });
  }

  if (unit !== undefined) {
    throw new ApiError(400, 'Unit cannot be changed after creation', { unit: 'Unit cannot be changed after creation' });
  }

  if (period !== undefined) {
    if (typeof period !== 'string' || !period.trim()) {
      throw new ApiError(400, 'Billing period cannot be empty', { period: 'Billing period cannot be empty' });
    }
    bill.period = period.trim();
  }

  if (amount !== undefined) {
    if (typeof amount !== 'number' || isNaN(amount)) {
      throw new ApiError(400, 'Amount must be a number', { amount: 'Amount must be a number' });
    }
    if (amount <= 0) {
      throw new ApiError(400, 'Amount must be greater than 0', { amount: 'Amount must be greater than 0' });
    }
    bill.amount = amount;
  }

  if (description !== undefined) {
    if (typeof description !== 'string') {
      throw new ApiError(400, 'Description must be a string', { description: 'Description must be a string' });
    }
    bill.description = description.trim();
  }

  if (dueDate !== undefined) {
    if (dueDate === null) {
      bill.dueDate = null;
    } else {
      const parsed = new Date(dueDate);
      if (isNaN(parsed.getTime())) {
        throw new ApiError(400, 'Invalid due date format', { dueDate: 'Invalid due date format' });
      }
      bill.dueDate = parsed;
    }
  }

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      throw new ApiError(400, 'Status must be pending, paid, or overdue', { status: 'Invalid bill status' });
    }
    managePaidAt(bill, status);
    bill.status = status;
  }

  const updatedBill = await bill.save();
  await updatedBill.populate(billPopulation);
  return sendSuccess(res, updatedBill, 'Bill updated successfully');
});

const deleteBill = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Bill not found');
  }

  // TODO: When Payments module is implemented, block deletion if linked payments exist
  const bill = await Bill.findByIdAndDelete(id);
  if (!bill) {
    throw new ApiError(404, 'Bill not found');
  }

  return sendSuccess(res, null, 'Bill deleted successfully');
});

module.exports = {
  getBills,
  getBillById,
  createBill,
  updateBill,
  deleteBill,
};
