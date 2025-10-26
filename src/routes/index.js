const express = require('express');
const eventRoutes = require('./events');
const insightsRoutes = require('./insights');
const influenceSpreaderRoutes = require('./influenceSpreader');

const router = express.Router();

// Routes
router.use('/api/events', eventRoutes);
router.use('/api/insights', insightsRoutes);
router.use('/api/influence-spreader', influenceSpreaderRoutes);

module.exports = {
  router,
  eventRoutes,
  insightsRoutes,
  influenceSpreaderRoutes
};
