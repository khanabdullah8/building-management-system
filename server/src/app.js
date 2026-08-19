const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const { NODE_ENV, ALLOWED_ORIGINS } = require('./config/env');
const { createRateLimiter } = require('./middlewares/rateLimit');
const notFoundHandler = require('./middlewares/notFound');
const errorHandler = require('./middlewares/error');

const buildingRoutes = require('./routes/buildingRoutes');
const unitRoutes = require('./routes/unitRoutes');
const residentRoutes = require('./routes/residentRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const noticeRoutes = require('./routes/noticeRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
const parkingRoutes = require('./routes/parkingRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const billingRoutes = require('./routes/billingRoutes');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev', { skip: () => NODE_ENV === 'test' }));
app.use(createRateLimiter());

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'BMMS backend is running',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v1/buildings', buildingRoutes);
app.use('/api/v1/units', unitRoutes);
app.use('/api/v1/residents', residentRoutes);
app.use('/api/v1/maintenance', maintenanceRoutes);
app.use('/api/v1/complaints', complaintRoutes);
app.use('/api/v1/notices', noticeRoutes);
app.use('/api/v1/visitors', visitorRoutes);
app.use('/api/v1/parking', parkingRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/billing', billingRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
