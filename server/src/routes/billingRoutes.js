const express = require('express');
const {
  getBills,
  getBillById,
  createBill,
  updateBill,
  deleteBill,
} = require('../controllers/billingController');

const router = express.Router();

router.route('/')
  .get(getBills)
  .post(createBill);

router.route('/:id')
  .get(getBillById)
  .patch(updateBill)
  .delete(deleteBill);

module.exports = router;
