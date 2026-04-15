const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes       = require('./routes/auth.routes');
const bhaktoRoutes     = require('./routes/bhakto.routes');
const eventRoutes      = require('./routes/event.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const userRoutes       = require('./routes/user.routes');
const dashboardRoutes  = require('./routes/dashboard.routes');
const categoryRoutes      = require('./routes/category.routes');
const societyRoutes       = require('./routes/society.routes');
const notificationRoutes  = require('./routes/notification.routes');
const reportRoutes        = require('./routes/report.routes');
const logsRoutes          = require('./routes/logs.routes');

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth',       authRoutes);
app.use('/api/bhakto',     bhaktoRoutes);
app.use('/api/events',     eventRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api/category',      categoryRoutes);
app.use('/api/society',       societyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/logs',          logsRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ success: true, data: 'UMandal API is running' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

module.exports = app;