const express = require('express');
const {
  getBills,
  getBillById,
  createBill,
  updateBill,
  deleteBill,
} = require('../controllers/billingController');
const { authorize } = require('../middlewares/auth');

const router = express.Router();

router.route('/')
  .get(getBills)
  .post(authorize('admin', 'staff'), createBill);

router.route('/:id')
  .get(getBillById)
  .patch(authorize('admin', 'staff'), updateBill)
  .delete(authorize('admin', 'staff'), deleteBill);

module.exports = router;
