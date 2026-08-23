const express = require('express');
const { getAuditLogs } = require('../controllers/auditLogController');
const { authorize } = require('../middlewares/auth');

const router = express.Router();

// Audit logs are read-only and admin-only. No write routes exist by design.
router.use(authorize('admin'));

router.route('/').get(getAuditLogs);

module.exports = router;
