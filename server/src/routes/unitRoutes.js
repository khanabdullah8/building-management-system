const express = require('express');
const {
  getUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
} = require('../controllers/unitController');

const router = express.Router();

router.route('/')
  .get(getUnits)
  .post(createUnit);

router.route('/:id')
  .get(getUnitById)
  .patch(updateUnit)
  .delete(deleteUnit);

module.exports = router;
