const express = require('express');
const {
  getBuildings,
  getBuildingById,
  createBuilding,
  updateBuilding,
  deleteBuilding,
} = require('../controllers/buildingController');

const router = express.Router();

router.route('/')
  .get(getBuildings)
  .post(createBuilding);

router.route('/:id')
  .get(getBuildingById)
  .patch(updateBuilding)
  .delete(deleteBuilding);

module.exports = router;
