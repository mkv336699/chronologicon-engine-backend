const express = require('express');
const { EventCollection } = require('../models/Event');

const router = express.Router();

// Create EventCollection instance
const eventCollection = new EventCollection();

// GET /api/influence-spreader - Event influence path finding
router.get('/', async (req, res) => {
  try {
    const { sourceEventId, targetEventId } = req.query;
    
    if (!sourceEventId || !targetEventId) {
      return res.status(400).json({ 
        error: 'sourceEventId and targetEventId query parameters are required' 
      });
    }

    // Use the global eventCollection instance
    
    // Verify both events exist
    const sourceEvent = await eventCollection.getEvent(sourceEventId);
    const targetEvent = await eventCollection.getEvent(targetEventId);
    
    if (!sourceEvent) {
      return res.status(404).json({ error: 'Source event not found' });
    }
    
    if (!targetEvent) {
      return res.status(404).json({ error: 'Target event not found' });
    }

    // Find shortest path using BFS
    const shortestPath = await findShortestPath(sourceEventId, targetEventId, eventCollection);
    
    if (shortestPath.length === 0) {
      return res.json({
        sourceEventId: sourceEventId,
        targetEventId: targetEventId,
        shortestPath: [],
        totalDurationMinutes: 0,
        message: "No temporal path found from source to target event."
      });
    }

    // Calculate total duration
    const totalDurationMinutes = shortestPath.reduce((total, event) => {
      return total + event.duration_minutes;
    }, 0);

    res.json({
      sourceEventId: sourceEventId,
      targetEventId: targetEventId,
      shortestPath: shortestPath,
      totalDurationMinutes: totalDurationMinutes,
      message: "Shortest temporal path found from source to target event."
    });

  } catch (error) {
    console.error('Error finding influence path:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function findShortestPath(sourceEventId, targetEventId, eventCollection) {
  const queue = [{ eventId: sourceEventId, path: [] }];
  const visited = new Set();
  
  while (queue.length > 0) {
    const { eventId, path } = queue.shift();
    
    if (visited.has(eventId)) {
      continue;
    }
    
    visited.add(eventId);
    
    const event = await eventCollection.getEvent(eventId);
    if (!event) {
      continue;
    }
    
    const currentPath = [...path, {
      event_id: event.eventId,
      event_name: event.eventName,
      duration_minutes: Math.round((event.endDate - event.startDate) / (1000 * 60))
    }];
    
    // Check if we've reached the target
    if (eventId === targetEventId) {
      return currentPath;
    }
    
    // Add children to queue
    const children = await eventCollection.getChildEvents(eventId);
    for (const child of children) {
      if (!visited.has(child.eventId)) {
        queue.push({ eventId: child.eventId, path: currentPath });
      }
    }
    
    // Add parent to queue
    if (event.parentId) {
      const parent = await eventCollection.getEvent(event.parentId);
      if (parent && !visited.has(parent.eventId)) {
        queue.push({ eventId: parent.eventId, path: currentPath });
      }
    }
  }
  
  return []; // No path found
}

module.exports = router;