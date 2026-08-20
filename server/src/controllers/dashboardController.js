const mongoose = require('mongoose');
const Building = require('../models/Building');
const Unit = require('../models/Unit');
const Maintenance = require('../models/Maintenance');
const Complaint = require('../models/Complaint');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const complaintPopulation = {
  path: 'unit',
  populate: { path: 'building', select: 'name code' },
};

const maintenancePopulation = {
  path: 'unit',
  populate: { path: 'building', select: 'name code' },
};

const paymentPopulation = {
  path: 'bill',
  populate: {
    path: 'unit',
    populate: { path: 'building', select: 'name code' },
  },
};

const getDashboard = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const { buildingIds, unitId } = req.scope;

  if (req.user.role === 'resident' && !unitId) {
    return sendSuccess(res, {
      buildings: 0,
      units: 0,
      occupied: 0,
      vacant: 0,
      pendingMaintenance: 0,
      openComplaints: 0,
      pendingPayments: 0,
      monthlyCollection: 0,
      recentComplaints: [],
      recentMaintenance: [],
      recentPayments: [],
    });
  }

  let buildingFilter = {};
  let unitFilter = {};
  let maintenanceFilter = {};
  let complaintFilter = {};
  let billFilter = {};

  if (req.user.role === 'resident' && unitId) {
    const oid = new mongoose.Types.ObjectId(unitId);
    unitFilter = { _id: oid };
    maintenanceFilter = { unit: oid };
    complaintFilter = { unit: oid };
    billFilter = { unit: oid };
    if (buildingIds && buildingIds.length > 0) {
      buildingFilter = { _id: new mongoose.Types.ObjectId(buildingIds[0]) };
    }
  } else if (buildingIds !== null) {
    const bIds = buildingIds.map((id) => new mongoose.Types.ObjectId(id));
    buildingFilter = { _id: { $in: bIds } };
    unitFilter = { building: { $in: bIds } };
    const scopedUnitIds = (await Unit.find({ building: { $in: bIds } }).select('_id').lean()).map((u) => u._id);
    maintenanceFilter = { unit: { $in: scopedUnitIds } };
    complaintFilter = {
      $or: [
        { unit: { $in: scopedUnitIds } },
        { building: { $in: bIds } },
      ],
    };
    billFilter = { unit: { $in: scopedUnitIds } };
  }

  const hasScopeFilter = Object.keys(billFilter).length > 0;
  const scopedBillIds = hasScopeFilter
    ? (await Bill.find(billFilter).select('_id').lean()).map((b) => b._id)
    : null;

  const paymentMatch = {
    status: 'completed',
    paidAt: { $gte: startOfMonth, $lte: endOfMonth },
  };
  if (scopedBillIds) {
    paymentMatch.bill = { $in: scopedBillIds };
  }

  const recentPaymentFilter = { status: 'completed' };
  if (scopedBillIds) {
    recentPaymentFilter.bill = { $in: scopedBillIds };
  }

  const [
    buildings,
    totalUnits,
    occupiedUnits,
    vacantUnits,
    pendingMaintenance,
    openComplaints,
    pendingBills,
    monthlyCollectionResult,
    recentComplaints,
    recentMaintenance,
    recentPayments,
  ] = await Promise.all([
    Building.countDocuments(buildingFilter),
    Unit.countDocuments(unitFilter),
    Unit.countDocuments({ ...unitFilter, status: 'occupied' }),
    Unit.countDocuments({ ...unitFilter, status: 'vacant' }),
    Maintenance.countDocuments({ ...maintenanceFilter, status: { $in: ['open', 'in-progress'] } }),
    Complaint.countDocuments({ ...complaintFilter, status: { $in: ['open', 'in-progress'] } }),
    Bill.countDocuments({ ...billFilter, status: { $in: ['pending', 'overdue'] } }),
    Payment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Complaint.find(complaintFilter)
      .populate(complaintPopulation)
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Maintenance.find(maintenanceFilter)
      .populate(maintenancePopulation)
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Payment.find(recentPaymentFilter)
      .populate(paymentPopulation)
      .sort({ paidAt: -1 })
      .limit(5)
      .lean(),
  ]);

  const monthlyCollection =
    monthlyCollectionResult.length > 0 ? monthlyCollectionResult[0].total : 0;

  return sendSuccess(res, {
    buildings,
    units: totalUnits,
    occupied: occupiedUnits,
    vacant: vacantUnits,
    pendingMaintenance,
    openComplaints,
    pendingPayments: pendingBills,
    monthlyCollection,
    recentComplaints,
    recentMaintenance,
    recentPayments,
  });
});

module.exports = { getDashboard };
