const express = require('express');
const {
  getNotices,
  getNoticeById,
  createNotice,
  updateNotice,
  deleteNotice,
} = require('../controllers/noticeController');

const router = express.Router();

router.route('/')
  .get(getNotices)
  .post(createNotice);

router.route('/:id')
  .get(getNoticeById)
  .patch(updateNotice)
  .delete(deleteNotice);

module.exports = router;
