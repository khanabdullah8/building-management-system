const express = require('express');
const {
  getPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
} = require('../controllers/paymentController');
const { authorize } = require('../middlewares/auth');

const router = express.Router();

router.route('/')
  .get(getPayments)
  .post(createPayment);

router.route('/:id')
  .get(getPaymentById)
  .patch(authorize('admin', 'staff'), updatePayment)
  .delete(authorize('admin', 'staff'), deletePayment);

module.exports = router;
