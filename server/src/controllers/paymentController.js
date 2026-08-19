const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Bill = require('../models/Bill');
const Unit = require('../models/Unit');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const paymentPopulation = {
  path: 'bill',
  populate: {
    path: 'unit',
    populate: { path: 'building', select: 'name code' },
  },
};

const VALID_METHODS = ['cash', 'bank_transfer', 'upi', 'card', 'cheque'];
const VALID_STATUSES = ['completed', 'pending', 'failed'];

const recalculateBillStatus = async (billId) => {
  const bill = await Bill.findById(billId);
  if (!bill) return;

  const completedPayments = await Payment.find({
    bill: billId,
    status: 'completed',
  });

  const sumPaid = completedPayments.reduce((sum, p) => sum + p.amount, 0);

  if (sumPaid >= bill.amount) {
    bill.status = 'paid';
    const earliest = completedPayments.reduce((min, p) =>
      p.paidAt < min.paidAt ? p : min
    );
    bill.paidAt = earliest.paidAt;
  } else {
    bill.status = 'pending';
    bill.paidAt = null;
  }

  await bill.save();
};

const validateBill = async (billId) => {
  if (!mongoose.Types.ObjectId.isValid(billId)) {
    throw new ApiError(400, 'Invalid bill ID format', { bill: 'Invalid bill ID format' });
  }

  const bill = await Bill.findById(billId);
  if (!bill) {
    throw new ApiError(400, 'Referenced bill does not exist', { bill: 'Referenced bill does not exist' });
  }
};

const generateUniquePaymentNo = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const dateStr = `${y}${m}${d}`;
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    const paymentNo = `PAY-${dateStr}-${rand}`;

    const existing = await Payment.findOne({ paymentNo }).select('_id').lean();
    if (!existing) return paymentNo;
  }

  throw new ApiError(500, 'Failed to generate unique payment number');
};

const getPayments = asyncHandler(async (req, res) => {
  const { search, bill, building, status, method, dateFrom, dateTo } = req.query;
  const filter = {};

  if (bill) {
    if (!mongoose.Types.ObjectId.isValid(bill)) {
      return sendSuccess(res, []);
    }
    filter.bill = bill;
  }

  if (building) {
    if (!mongoose.Types.ObjectId.isValid(building)) {
      return sendSuccess(res, []);
    }
    const unitIds = await Unit.find({ building }).select('_id');
    if (unitIds.length === 0) return sendSuccess(res, []);
    const billIds = await Bill.find({ unit: { $in: unitIds.map((u) => u._id) } }).select('_id');
    if (billIds.length === 0) return sendSuccess(res, []);
    filter.bill = { $in: billIds.map((b) => b._id) };
  }

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return sendSuccess(res, []);
    }
    filter.status = status;
  }

  if (method) {
    if (!VALID_METHODS.includes(method)) {
      return sendSuccess(res, []);
    }
    filter.method = method;
  }

  if (dateFrom) {
    const parsed = new Date(dateFrom);
    if (!isNaN(parsed.getTime())) {
      filter.paidAt = { ...filter.paidAt, $gte: parsed };
    }
  }

  if (dateTo) {
    const parsed = new Date(dateTo);
    if (!isNaN(parsed.getTime())) {
      const endOfDay = new Date(parsed);
      endOfDay.setHours(23, 59, 59, 999);
      filter.paidAt = { ...filter.paidAt, $lte: endOfDay };
    }
  }

  if (search) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escaped, 'i');

    filter.$or = [
      { paymentNo: searchRegex },
      { reference: searchRegex },
      { notes: searchRegex },
    ];
  }

  const payments = await Payment.find(filter)
    .populate(paymentPopulation)
    .sort({ paidAt: -1 });

  return sendSuccess(res, payments);
});

const getPaymentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Payment not found');
  }

  const payment = await Payment.findById(id).populate(paymentPopulation);

  if (!payment) {
    throw new ApiError(404, 'Payment not found');
  }

  return sendSuccess(res, payment);
});

const createPayment = asyncHandler(async (req, res) => {
  const { bill: billId, amount, method, status, reference, notes } = req.body;

  if (!billId) {
    throw new ApiError(400, 'Bill ID is required', { bill: 'Bill ID is required' });
  }

  await validateBill(billId);

  if (amount === undefined || amount === null) {
    throw new ApiError(400, 'Amount is required', { amount: 'Amount is required' });
  }

  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new ApiError(400, 'Amount must be a number', { amount: 'Amount must be a number' });
  }

  if (amount <= 0) {
    throw new ApiError(400, 'Amount must be greater than 0', { amount: 'Amount must be greater than 0' });
  }

  if (!method || typeof method !== 'string' || !method.trim()) {
    throw new ApiError(400, 'Payment method is required', { method: 'Payment method is required' });
  }

  if (!VALID_METHODS.includes(method.trim())) {
    throw new ApiError(400, 'Method must be one of: cash, bank_transfer, upi, card, cheque', {
      method: 'Invalid payment method',
    });
  }

  if (status !== undefined && status !== null) {
    if (!VALID_STATUSES.includes(status)) {
      throw new ApiError(400, 'Status must be completed, pending, or failed', { status: 'Invalid payment status' });
    }
  }

  if (reference !== undefined && typeof reference !== 'string') {
    throw new ApiError(400, 'Reference must be a string', { reference: 'Reference must be a string' });
  }

  if (notes !== undefined && typeof notes !== 'string') {
    throw new ApiError(400, 'Notes must be a string', { notes: 'Notes must be a string' });
  }

  let paymentNo;
  if (req.body.paymentNo !== undefined && req.body.paymentNo !== null) {
    if (typeof req.body.paymentNo !== 'string' || !req.body.paymentNo.trim()) {
      throw new ApiError(400, 'Payment number must be a non-empty string', { paymentNo: 'Payment number must be a non-empty string' });
    }
    paymentNo = req.body.paymentNo.trim();
  } else {
    paymentNo = await generateUniquePaymentNo();
  }

  const paymentData = {
    paymentNo,
    bill: billId,
    amount,
    method: method.trim(),
    status: status || 'completed',
    reference: reference !== undefined ? reference.trim() : '',
    notes: notes !== undefined ? notes.trim() : '',
    paidAt: new Date(),
  };

  let payment;
  try {
    payment = await Payment.create(paymentData);
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(400, 'A payment with this payment number already exists', { paymentNo: 'Payment number already exists' });
    }
    throw err;
  }

  await recalculateBillStatus(billId);
  await payment.populate(paymentPopulation);
  return sendSuccess(res, payment, 'Payment recorded successfully', null, 201);
});

const updatePayment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Payment not found');
  }

  const payment = await Payment.findById(id);
  if (!payment) {
    throw new ApiError(404, 'Payment not found');
  }

  const { paymentNo, bill, amount, method, status, reference, notes } = req.body;

  if (paymentNo !== undefined) {
    throw new ApiError(400, 'Payment number cannot be changed', { paymentNo: 'Payment number cannot be changed' });
  }

  if (bill !== undefined) {
    throw new ApiError(400, 'Bill cannot be changed after creation', { bill: 'Bill cannot be changed after creation' });
  }

  if (amount !== undefined) {
    if (typeof amount !== 'number' || isNaN(amount)) {
      throw new ApiError(400, 'Amount must be a number', { amount: 'Amount must be a number' });
    }
    if (amount <= 0) {
      throw new ApiError(400, 'Amount must be greater than 0', { amount: 'Amount must be greater than 0' });
    }
    payment.amount = amount;
  }

  if (method !== undefined) {
    if (typeof method !== 'string' || !method.trim()) {
      throw new ApiError(400, 'Payment method cannot be empty', { method: 'Payment method cannot be empty' });
    }
    if (!VALID_METHODS.includes(method.trim())) {
      throw new ApiError(400, 'Method must be one of: cash, bank_transfer, upi, card, cheque', {
        method: 'Invalid payment method',
      });
    }
    payment.method = method.trim();
  }

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      throw new ApiError(400, 'Status must be completed, pending, or failed', { status: 'Invalid payment status' });
    }
    payment.status = status;
  }

  if (reference !== undefined) {
    if (typeof reference !== 'string') {
      throw new ApiError(400, 'Reference must be a string', { reference: 'Reference must be a string' });
    }
    payment.reference = reference.trim();
  }

  if (notes !== undefined) {
    if (typeof notes !== 'string') {
      throw new ApiError(400, 'Notes must be a string', { notes: 'Notes must be a string' });
    }
    payment.notes = notes.trim();
  }

  const statusChanged =
    (status !== undefined && status !== payment.status) ||
    (status !== undefined);

  await payment.save();
  await recalculateBillStatus(payment.bill);
  await payment.populate(paymentPopulation);
  return sendSuccess(res, payment, 'Payment updated successfully');
});

const deletePayment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Payment not found');
  }

  const payment = await Payment.findById(id);
  if (!payment) {
    throw new ApiError(404, 'Payment not found');
  }

  const billId = payment.bill;
  await Payment.findByIdAndDelete(id);
  await recalculateBillStatus(billId);

  return sendSuccess(res, null, 'Payment deleted successfully');
});

module.exports = {
  getPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
  recalculateBillStatus,
};
