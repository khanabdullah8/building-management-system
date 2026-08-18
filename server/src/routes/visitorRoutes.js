const express = require('express');
const {
  getVisitors,
  getVisitorById,
  createVisitor,
  updateVisitor,
  deleteVisitor,
} = require('../controllers/visitorController');

const router = express.Router();

router.route('/')
  .get(getVisitors)
  .post(createVisitor);

router.route('/:id')
  .get(getVisitorById)
  .patch(updateVisitor)
  .delete(deleteVisitor);

module.exports = router;
