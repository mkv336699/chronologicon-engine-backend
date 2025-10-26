require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { router } = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { testConnection } = require('./config/database');


const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));


// Routes
app.use(router);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Chronologicon Engine API',
    version: '1.0.0',
    description: 'Temporal Gap Finder and Event Influence Spreader',
    endpoints: {
      events: '/api/events',
      insights: '/api/insights',
      influenceSpreader: '/api/influence-spreader',
      health: '/health'
    }
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('Warning: Database connection failed. Some features may not work properly.');
  }
});

module.exports = app;
