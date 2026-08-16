const express = require('express');
const {
  getResidents,
  getResidentById,
  createResident,
  updateResident,
  deleteResident,
} = require('../controllers/residentController');

const router = express.Router();

router.route('/')
  .get(getResidents)
  .post(createResident);

router.route('/:id')
  .get(getResidentById)
  .patch(updateResident)
  .delete(deleteResident);

module.exports = router;
