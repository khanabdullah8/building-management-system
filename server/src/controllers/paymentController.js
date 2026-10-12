const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Bill = require('../models/Bill');
const Unit = require('../models/Unit');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { isBuildingAllowed, unitScopeFilter } = require('../utils/scope');
const { record: recordAudit } = require('../services/auditService');
const { getPagination, paginationMeta } = require('../utils/pagination');

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
  } else if (bill.status === 'overdue') {
    // A partial/incomplete payment must not downgrade an overdue bill to
    // pending. Keep it overdue until the outstanding balance is settled.
    bill.paidAt = null;
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
  return bill;
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
  const { buildingIds, unitId } = req.scope;
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  const emptyResult = () => sendSuccess(res, [], null, paginationMeta(page, limit, 0));

  if (req.user.role === 'resident') {
    if (unitId) {
      const billIds = await Bill.find({ unit: new mongoose.Types.ObjectId(unitId) }).select('_id');
      if (billIds.length === 0) return emptyResult();
      filter.bill = { $in: billIds.map((b) => b._id) };
    } else {
      filter._id = { $in: [] };
    }
  } else if (buildingIds !== null) {
    const sf = await unitScopeFilter(buildingIds);
    if (sf.unit && sf.unit.$in && sf.unit.$in.length === 0) {
      filter._id = { $in: [] };
    } else if (Object.keys(sf).length > 0) {
      const billIds = await Bill.find({ unit: sf.unit }).select('_id');
      if (billIds.length === 0) return emptyResult();
      filter.bill = { $in: billIds.map((b) => b._id) };
    }
  }

  if (bill) {
    if (!mongoose.Types.ObjectId.isValid(bill)) {
      return emptyResult();
    }

    const requestedBillId = new mongoose.Types.ObjectId(bill);

    if (req.user.role === 'resident') {
      const allowedBillIds = filter.bill && filter.bill.$in ? filter.bill.$in : [];
      const isOwnBill = allowedBillIds.some(
        (id) => id.toString() === requestedBillId.toString()
      );
      if (!isOwnBill) {
        return emptyResult();
      }
      filter.bill = { $in: [requestedBillId] };
    } else if (filter.bill && filter.bill.$in) {
      // Staff: filter.bill is scoped to the staff member's assigned buildings
      // (resolved via unitScopeFilter). Intersect the requested bill with that
      // scoped set rather than unioning an arbitrary ID — otherwise a staff
      // member could read payments for a bill outside their buildings.
      const inScope = filter.bill.$in.some(
        (id) => id.toString() === requestedBillId.toString()
      );
      if (!inScope) {
        return emptyResult();
      }
      filter.bill = { $in: [requestedBillId] };
    } else {
      filter.bill = requestedBillId;
    }
  }

  if (building && req.user.role !== 'resident') {
    if (!mongoose.Types.ObjectId.isValid(building)) {
      return emptyResult();
    }
    if (buildingIds !== null && !isBuildingAllowed(buildingIds, building)) {
      return emptyResult();
    }
    const unitIds = await Unit.find({ building }).select('_id');
    if (unitIds.length === 0) return emptyResult();
    const billIds = await Bill.find({ unit: { $in: unitIds.map((u) => u._id) } }).select('_id');
    if (billIds.length === 0) return emptyResult();
    filter.bill = { $in: billIds.map((b) => b._id) };
  }

  if (status) {
    if (!VALID_STATUSES.includes(status)) {
      return emptyResult();
    }
    filter.status = status;
  }

  if (method) {
    if (!VALID_METHODS.includes(method)) {
      return emptyResult();
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

  const total = await Payment.countDocuments(filter);
  const payments = await Payment.find(filter)
    .populate(paymentPopulation)
    .sort({ paidAt: -1 })
    .limit(limit)
    .skip(skip);

  return sendSuccess(res, payments, null, paginationMeta(page, limit, total));
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

  const { buildingIds, unitId: scopeUnitId } = req.scope;
  if (req.user.role === 'resident') {
    if (scopeUnitId && payment.bill && payment.bill.unit && payment.bill.unit._id.toString() === scopeUnitId) {
      return sendSuccess(res, payment);
    }
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  } else if (buildingIds !== null) {
    if (payment.bill && payment.bill.unit && payment.bill.unit.building) {
      const buildingRef = payment.bill.unit.building._id || payment.bill.unit.building;
      if (!isBuildingAllowed(buildingIds, buildingRef.toString())) {
        throw new ApiError(403, 'Forbidden: insufficient permissions');
      }
    }
  }

  return sendSuccess(res, payment);
});

const createPayment = asyncHandler(async (req, res) => {
  const { bill: billId, amount, method, status, reference, notes } = req.body;

  if (!billId) {
    throw new ApiError(400, 'Bill ID is required', { bill: 'Bill ID is required' });
  }

  const bill = await validateBill(billId);

  if (req.user.role === 'resident') {
    if (!req.scope.unitId || !bill.unit || bill.unit.toString() !== req.scope.unitId) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  } else if (!isBuildingAllowed(req.scope.buildingIds, null)) {
    const billUnit = await Unit.findById(bill.unit).select('building').lean();
    if (!billUnit || !isBuildingAllowed(req.scope.buildingIds, billUnit.building)) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
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

  // Residents may only submit pending payments. Money is not marked received
  // until a trusted admin/staff member confirms it. A resident-declared
  // completed or failed status is rejected (not silently coerced) so a client
  // cannot imply a verified payment.
  const isResident = req.user.role === 'resident';
  if (isResident && status !== undefined && status !== null && status !== 'pending') {
    throw new ApiError(403, 'Residents may only submit payments with pending status', {
      status: 'Residents may only submit pending payments',
    });
  }
  const effectiveStatus = isResident ? 'pending' : status || 'completed';

  // Resident self-service payments are unverified claims. Prevent a claim from
  // exceeding the outstanding balance or being filed against an already-settled
  // bill. Admin/staff retain the existing unrestricted workflow.
  if (isResident) {
    const settledPayments = await Payment.find({ bill: billId, status: 'completed' })
      .select('amount')
      .lean();
    const paidToDate = settledPayments.reduce((sum, p) => sum + p.amount, 0);
    const outstanding = bill.amount - paidToDate;

    if (outstanding <= 0) {
      throw new ApiError(400, 'This bill has already been paid in full', {
        amount: 'Bill already paid',
      });
    }

    if (amount > outstanding) {
      throw new ApiError(400, `Amount exceeds the outstanding balance of ${outstanding}`, {
        amount: 'Amount exceeds the outstanding balance',
      });
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
    status: effectiveStatus,
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

  const auditUnit = await Unit.findById(bill.unit).select('building').lean();

  try {
    await recordAudit({
      actor: req.user,
      action: 'created',
      module: 'payment',
      resourceId: payment._id,
      resourceLabel: payment.paymentNo,
      buildingId: auditUnit ? auditUnit.building : null,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
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

  const { buildingIds, unitId: scopeUnitId } = req.scope;
  if (req.user.role === 'resident') {
    if (!scopeUnitId) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
    const billDoc = await Bill.findById(payment.bill).select('unit').lean();
    if (!billDoc || billDoc.unit.toString() !== scopeUnitId) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  } else if (buildingIds !== null) {
    const billDoc = await Bill.findById(payment.bill).select('unit').lean();
    if (billDoc) {
      const billUnit = await Unit.findById(billDoc.unit).select('building').lean();
      if (!billUnit || !isBuildingAllowed(buildingIds, billUnit.building)) {
        throw new ApiError(403, 'Forbidden: insufficient permissions');
      }
    }
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

  const auditBill = await Bill.findById(payment.bill).select('unit').lean();
  const auditUnit = auditBill ? await Unit.findById(auditBill.unit).select('building').lean() : null;

  await payment.save();

  try {
    await recordAudit({
      actor: req.user,
      action: 'updated',
      module: 'payment',
      resourceId: payment._id,
      resourceLabel: payment.paymentNo,
      buildingId: auditUnit ? auditUnit.building : null,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }

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

  const { buildingIds, unitId: scopeUnitId } = req.scope;
  if (req.user.role === 'resident') {
    if (!scopeUnitId) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
    const billDoc = await Bill.findById(payment.bill).select('unit').lean();
    if (!billDoc || billDoc.unit.toString() !== scopeUnitId) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  } else if (buildingIds !== null) {
    const billDoc = await Bill.findById(payment.bill).select('unit').lean();
    if (billDoc) {
      const billUnit = await Unit.findById(billDoc.unit).select('building').lean();
      if (!billUnit || !isBuildingAllowed(buildingIds, billUnit.building)) {
        throw new ApiError(403, 'Forbidden: insufficient permissions');
      }
    }
  }

  const billId = payment.bill;

  const auditBill = await Bill.findById(payment.bill).select('unit').lean();
  const auditUnit = auditBill ? await Unit.findById(auditBill.unit).select('building').lean() : null;

  await Payment.findByIdAndDelete(id);

  try {
    await recordAudit({
      actor: req.user,
      action: 'deleted',
      module: 'payment',
      resourceId: id,
      resourceLabel: payment.paymentNo,
      buildingId: auditUnit ? auditUnit.building : null,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }

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
