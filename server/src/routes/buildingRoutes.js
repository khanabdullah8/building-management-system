const express = require('express');
const {
  getBuildings,
  getBuildingById,
  createBuilding,
  updateBuilding,
  deleteBuilding,
} = require('../controllers/buildingController');
const { authorize } = require('../middlewares/auth');

const router = express.Router();

router.route('/')
  .get(getBuildings)
  .post(authorize('admin', 'staff'), createBuilding);

router.route('/:id')
  .get(getBuildingById)
  .patch(authorize('admin', 'staff'), updateBuilding)
  .delete(authorize('admin', 'staff'), deleteBuilding);

module.exports = router;
