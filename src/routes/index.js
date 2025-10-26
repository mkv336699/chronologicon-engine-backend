const express = require('express');
const eventRoutes = require('./events');
const insightsRoutes = require('./insights');
const timelineRoutes = require('./timeline');

const router = express.Router();

// Routes
router.use('/api/events', eventRoutes);
router.use('/api/insights', insightsRoutes);
router.use('/api/timeline', timelineRoutes);

module.exports = {
  router,
  eventRoutes,
  insightsRoutes,
  timelineRoutes
};
