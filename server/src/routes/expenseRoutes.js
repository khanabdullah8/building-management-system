const express = require('express');
const {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
} = require('../controllers/expenseController');
const { authorize } = require('../middlewares/auth');

const router = express.Router();

router.route('/')
  .get(getExpenses)
  .post(authorize('admin', 'staff'), createExpense);

router.route('/:id')
  .get(getExpenseById)
  .patch(authorize('admin', 'staff'), updateExpense)
  .delete(authorize('admin', 'staff'), deleteExpense);

module.exports = router;
