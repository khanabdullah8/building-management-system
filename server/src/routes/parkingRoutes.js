const express = require('express');
const {
  getParkingSlots,
  getParkingSlotById,
  createParkingSlot,
  updateParkingSlot,
  deleteParkingSlot,
} = require('../controllers/parkingController');

const router = express.Router();

router.route('/')
  .get(getParkingSlots)
  .post(createParkingSlot);

router.route('/:id')
  .get(getParkingSlotById)
  .patch(updateParkingSlot)
  .delete(deleteParkingSlot);

module.exports = router;
