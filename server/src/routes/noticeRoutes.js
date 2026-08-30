const express = require('express');
const {
  getNotices,
  getNoticeById,
  createNotice,
  updateNotice,
  deleteNotice,
} = require('../controllers/noticeController');
const { authorize } = require('../middlewares/auth');

const router = express.Router();

router.route('/')
  .get(getNotices)
  .post(authorize('admin', 'staff'), createNotice);

router.route('/:id')
  .get(getNoticeById)
  .patch(authorize('admin', 'staff'), updateNotice)
  .delete(authorize('admin', 'staff'), deleteNotice);

module.exports = router;
