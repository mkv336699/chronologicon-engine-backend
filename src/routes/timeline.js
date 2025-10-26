const express = require('express');
const { EventCollection } = require('../models/Event');

const router = express.Router();

// Create EventCollection instance
const eventCollection = new EventCollection();

// Helper function to build hierarchical timeline
async function buildHierarchicalTimeline(event, eventCollection) {
  const timeline = {
    event_id: event.eventId,
    event_name: event.eventName,
    description: event.description,
    start_date: event.startDate.toISOString(),
    end_date: event.endDate.toISOString(),
    duration_minutes: Math.round((event.endDate - event.startDate) / (1000 * 60)),
    parent_event_id: event.parentId,
    children: []
  };

  // Find and add children
  const children = await eventCollection.getChildEvents(event.eventId);
  for (const child of children) {
    timeline.children.push(await buildHierarchicalTimeline(child, eventCollection));
  }

  return timeline;
}

// GET /api/timeline/:rootEventId - Hierarchical timeline endpoint
router.get('/:rootEventId', async (req, res) => {
  try {
    const { rootEventId } = req.params;
    
    // Get the event
    const event = await eventCollection.getEvent(rootEventId);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Build hierarchical timeline
    const timeline = await buildHierarchicalTimeline(event, eventCollection);
    res.json(timeline);

  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/timeline - Timeline events within a date range
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, sort } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'startDate and endDate query parameters are required' 
      });
    }

    const events = await eventCollection.getAllEvents();
    
    // Filter events within the specified date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const filteredEvents = events.filter(event => {
      const eventStart = new Date(event.startDate);
      const eventEnd = new Date(event.endDate);
      
      // Check if event overlaps with the specified range
      return eventStart <= end && eventEnd >= start;
    });

    // Sort events by start date (ascending by default)
    const sortedEvents = filteredEvents.sort((a, b) => {
      const aStart = new Date(a.startDate);
      const bStart = new Date(b.startDate);
      
      return sort === 'desc' ? bStart - aStart : aStart - bStart;
    });

    res.json({
      timeline: sortedEvents,
      count: sortedEvents.length,
      timeRange: {
        start: start.toISOString(),
        end: end.toISOString()
      }
    });

  } catch (error) {
    console.error('Timeline error:', error);
    res.status(500).json({ error: 'Failed to retrieve timeline' });
  }
});

module.exports = router;