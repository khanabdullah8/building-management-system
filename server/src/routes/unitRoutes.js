const express = require('express');
const {
  getUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
} = require('../controllers/unitController');
const { authorize } = require('../middlewares/auth');

const router = express.Router();

router.route('/')
  .get(getUnits)
  .post(authorize('admin', 'staff'), createUnit);

router.route('/:id')
  .get(getUnitById)
  .patch(authorize('admin', 'staff'), updateUnit)
  .delete(authorize('admin', 'staff'), deleteUnit);

module.exports = router;
