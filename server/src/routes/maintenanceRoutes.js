const express = require('express');
const {
  getMaintenanceRequests,
  getMaintenanceRequestById,
  createMaintenanceRequest,
  updateMaintenanceRequest,
  deleteMaintenanceRequest,
} = require('../controllers/maintenanceController');

const router = express.Router();

router.route('/')
  .get(getMaintenanceRequests)
  .post(createMaintenanceRequest);

router.route('/:id')
  .get(getMaintenanceRequestById)
  .patch(updateMaintenanceRequest)
  .delete(deleteMaintenanceRequest);

module.exports = router;
