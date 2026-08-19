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
    Building.countDocuments(),
    Unit.countDocuments(),
    Unit.countDocuments({ status: 'occupied' }),
    Unit.countDocuments({ status: 'vacant' }),
    Maintenance.countDocuments({ status: { $in: ['open', 'in-progress'] } }),
    Complaint.countDocuments({ status: { $in: ['open', 'in-progress'] } }),
    Bill.countDocuments({ status: { $in: ['pending', 'overdue'] } }),
    Payment.aggregate([
      {
        $match: {
          status: 'completed',
          paidAt: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Complaint.find()
      .populate(complaintPopulation)
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Maintenance.find()
      .populate(maintenancePopulation)
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Payment.find({ status: 'completed' })
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
