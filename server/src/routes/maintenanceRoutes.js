const express = require('express');
const {
  getMaintenanceRequests,
  getMaintenanceRequestById,
  createMaintenanceRequest,
  updateMaintenanceRequest,
  deleteMaintenanceRequest,
} = require('../controllers/maintenanceController');
const { authorize } = require('../middlewares/auth');

const router = express.Router();

router.route('/')
  .get(getMaintenanceRequests)
  .post(createMaintenanceRequest);

router.route('/:id')
  .get(getMaintenanceRequestById)
  .patch(authorize('admin', 'staff'), updateMaintenanceRequest)
  .delete(authorize('admin', 'staff'), deleteMaintenanceRequest);

module.exports = router;
