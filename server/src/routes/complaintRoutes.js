const express = require('express');
const {
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  deleteComplaint,
} = require('../controllers/complaintController');

const router = express.Router();

router.route('/')
  .get(getComplaints)
  .post(createComplaint);

router.route('/:id')
  .get(getComplaintById)
  .patch(updateComplaint)
  .delete(deleteComplaint);

module.exports = router;
