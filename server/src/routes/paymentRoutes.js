const express = require('express');
const {
  getPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
} = require('../controllers/paymentController');

const router = express.Router();

router.route('/')
  .get(getPayments)
  .post(createPayment);

router.route('/:id')
  .get(getPaymentById)
  .patch(updatePayment)
  .delete(deletePayment);

module.exports = router;
