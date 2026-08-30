const express = require('express');
const {
  getParkingSlots,
  getParkingSlotById,
  createParkingSlot,
  updateParkingSlot,
  deleteParkingSlot,
} = require('../controllers/parkingController');
const { authorize } = require('../middlewares/auth');

const router = express.Router();

router.route('/')
  .get(getParkingSlots)
  .post(authorize('admin', 'staff'), createParkingSlot);

router.route('/:id')
  .get(getParkingSlotById)
  .patch(authorize('admin', 'staff'), updateParkingSlot)
  .delete(authorize('admin', 'staff'), deleteParkingSlot);

module.exports = router;
