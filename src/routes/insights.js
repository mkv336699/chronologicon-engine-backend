const express = require('express');
const { EventCollection } = require('../models/Event');

const router = express.Router();

/**
 * Find the shortest temporal path between two events using BFS
 * @param {string} sourceEventId - The ID of the source event
 * @param {string} targetEventId - The ID of the target event
 * @param {EventCollection} eventCollection - Instance of EventCollection
 * @returns {Promise<Array>} - Array of events representing the shortest path
 */
async function findShortestPath(sourceEventId, targetEventId, eventCollection) {
  // Get all events
  const events = await eventCollection.getAllEvents();
  
  // Create a graph representation where events are nodes
  // and temporal relationships are edges
  const graph = {};
  
  // Initialize the graph
  events.forEach(event => {
    graph[event.eventId] = [];
  });
  
  // Build the graph - connect events that have temporal relationships
  // An event can influence events that start after it ends
  events.forEach(event1 => {
    const event1End = new Date(event1.endDate || event1.startDate);
    
    events.forEach(event2 => {
      if (event1.eventId !== event2.eventId) {
        const event2Start = new Date(event2.startDate);
        
        // If event1 ends before or at the same time event2 starts,
        // there's a potential influence (directed edge)
        if (event1End <= event2Start) {
          graph[event1.eventId].push(event2.eventId);
        }
      }
    });
  });
  
  // BFS to find shortest path
  const queue = [{ eventId: sourceEventId, path: [sourceEventId] }];
  const visited = new Set([sourceEventId]);
  
  while (queue.length > 0) {
    const { eventId, path } = queue.shift();
    
    if (eventId === targetEventId) {
      // Found the target, convert path of IDs to path of event objects
      const pathEvents = [];
      
      for (let i = 0; i < path.length; i++) {
        const event = events.find(e => e.eventId === path[i]);
        if (event) {
          // Calculate duration in minutes
          const startDate = new Date(event.startDate);
          const endDate = new Date(event.endDate || event.startDate);
          const durationMinutes = Math.round((endDate - startDate) / (1000 * 60));
          
          pathEvents.push({
            event_id: event.eventId,
            event_name: event.eventName,
            start_date: event.startDate,
            end_date: event.endDate || event.startDate,
            duration_minutes: durationMinutes
          });
        }
      }
      
      return pathEvents;
    }
    
    // Explore neighbors
    for (const neighborId of graph[eventId]) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push({
          eventId: neighborId,
          path: [...path, neighborId]
        });
      }
    }
  }
  
  // No path found
  return [];
}

// Create EventCollection instance
const eventCollection = new EventCollection();

// GET /api/insights/event-influence - Event influence analysis
// Analyzes how events influence each other based on temporal proximity
router.get('/event-influence', async (req, res) => {
  try {
    const { sourceEventId, targetEventId } = req.query;
    
    // If both IDs are provided, find shortest path between events
    if (sourceEventId && targetEventId) {
      // Verify both events exist
      const events = await eventCollection.getAllEvents();
      const sourceEvent = events.find(event => event.eventId === sourceEventId);
      const targetEvent = events.find(event => event.eventId === targetEventId);
      
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

      return res.json({
        sourceEventId: sourceEventId,
        targetEventId: targetEventId,
        shortestPath: shortestPath,
        totalDurationMinutes: totalDurationMinutes,
        message: "Shortest temporal path found from source to target event."
      });
    }
    
    // If only sourceEventId is provided, calculate influence on all other events
    if (sourceEventId) {
      const events = await eventCollection.getAllEvents();
      
      // Find the source event
      const sourceEvent = events.find(event => event.eventId === sourceEventId);
      
      if (!sourceEvent) {
        return res.status(404).json({ error: 'Source event not found' });
      }
      
      // Calculate influence based on temporal proximity
      const influencedEvents = events
        .filter(event => event.eventId !== sourceEventId) // Exclude the source event
        .map(event => {
          const sourceStart = new Date(sourceEvent.startDate);
          const eventStart = new Date(event.startDate);
          
          // Calculate temporal distance in days
          const timeDifference = Math.abs(eventStart - sourceStart) / (1000 * 60 * 60 * 24);
          
          // Calculate influence score (inverse of time difference)
          // Events closer in time have higher influence scores
          const influenceScore = timeDifference === 0 ? 100 : 100 / (1 + timeDifference);
          
          return {
            event_id: event.eventId,
            event_name: event.eventName,
            influence_score: Math.round(influenceScore),
            temporal_distance_days: Math.round(timeDifference * 10) / 10
          };
        })
        .sort((a, b) => b.influence_score - a.influence_score); // Sort by influence score descending
      
      return res.json({
        source_event: {
          event_id: sourceEvent.eventId,
          event_name: sourceEvent.eventName
        },
        influenced_events: influencedEvents
      });
    }
    
    // If neither sourceEventId nor targetEventId is provided
    return res.status(400).json({ 
      error: 'At least sourceEventId query parameter is required' 
    });

  } catch (error) {
    console.error('Error calculating event influence:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/insights/event-influence-path - Find influence path between events
router.get('/event-influence-path', async (req, res) => {
  try {
    const { sourceEventId, targetEventId } = req.query;
    
    if (!sourceEventId || !targetEventId) {
      return res.status(400).json({ 
        error: 'sourceEventId and targetEventId query parameters are required' 
      });
    }

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

// GET /api/insights/temporal-gaps - Find gaps between events
router.get('/temporal-gaps', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'startDate and endDate query parameters are required' 
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    // Get all events including those on or before startDate and on or after endDate
    const events = await eventCollection.getAllEvents();
    
    // Find the most recent event on or before startDate
    let mostRecentBeforeStart = null;
    let earliestAfterEnd = null;
    
    events.forEach(event => {
      const eventEnd = new Date(event.endDate || event.startDate);
      const eventStart = new Date(event.startDate);
      
      // Find most recent event on or before startDate
      if (eventEnd <= start) {
        if (!mostRecentBeforeStart || eventEnd > new Date(mostRecentBeforeStart.endDate || mostRecentBeforeStart.startDate)) {
          mostRecentBeforeStart = event;
        }
      }
      
      // Find earliest event on or after endDate
      if (eventStart >= end) {
        if (!earliestAfterEnd || eventStart < new Date(earliestAfterEnd.startDate)) {
          earliestAfterEnd = event;
        }
      }
    });
    
    // Get events within the time range
    const filteredEvents = events.filter(event => {
      const eventStart = new Date(event.startDate);
      const eventEnd = new Date(event.endDate || event.startDate);
      return eventStart >= start && eventEnd <= end;
    });
    
    // Sort events by start date
    filteredEvents.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    
    // Find gaps between events
    const gaps = [];
    
    // Add gap between mostRecentBeforeStart and first event in range (if exists)
    if (mostRecentBeforeStart && filteredEvents.length > 0) {
      const beforeEnd = new Date(mostRecentBeforeStart.endDate || mostRecentBeforeStart.startDate);
      const firstStart = new Date(filteredEvents[0].startDate);
      
      if (beforeEnd < firstStart) {
        const gapDurationMs = firstStart - beforeEnd;
        const gapDurationMinutes = Math.round(gapDurationMs / (1000 * 60));
        
        gaps.push({
          startOfGap: beforeEnd.toISOString(),
          endOfGap: firstStart.toISOString(),
          durationMinutes: gapDurationMinutes,
          precedingEvent: {
            event_id: mostRecentBeforeStart.eventId,
            event_name: mostRecentBeforeStart.eventName,
            end_date: beforeEnd.toISOString()
          },
          succeedingEvent: {
            event_id: filteredEvents[0].eventId,
            event_name: filteredEvents[0].eventName,
            start_date: firstStart.toISOString()
          }
        });
      }
    }
    
    // Find gaps between events in the range
    for (let i = 0; i < filteredEvents.length - 1; i++) {
      const currentEvent = filteredEvents[i];
      const nextEvent = filteredEvents[i + 1];
      
      const currentEnd = new Date(currentEvent.endDate || currentEvent.startDate);
      const nextStart = new Date(nextEvent.startDate);
      
      // If there's a gap between the current event's end and the next event's start
      if (currentEnd < nextStart) {
        const gapDurationMs = nextStart - currentEnd;
        const gapDurationMinutes = Math.round(gapDurationMs / (1000 * 60));
        
        gaps.push({
          startOfGap: currentEnd.toISOString(),
          endOfGap: nextStart.toISOString(),
          durationMinutes: gapDurationMinutes,
          precedingEvent: {
            event_id: currentEvent.eventId,
            event_name: currentEvent.eventName,
            end_date: currentEnd.toISOString()
          },
          succeedingEvent: {
            event_id: nextEvent.eventId,
            event_name: nextEvent.eventName,
            start_date: nextStart.toISOString()
          }
        });
      }
    }
    
    // Add gap between last event in range and earliestAfterEnd (if exists)
    if (earliestAfterEnd && filteredEvents.length > 0) {
      const lastEvent = filteredEvents[filteredEvents.length - 1];
      const lastEnd = new Date(lastEvent.endDate || lastEvent.startDate);
      const afterStart = new Date(earliestAfterEnd.startDate);
      
      if (lastEnd < afterStart) {
        const gapDurationMs = afterStart - lastEnd;
        const gapDurationMinutes = Math.round(gapDurationMs / (1000 * 60));
        
        gaps.push({
          startOfGap: lastEnd.toISOString(),
          endOfGap: afterStart.toISOString(),
          durationMinutes: gapDurationMinutes,
          precedingEvent: {
            event_id: lastEvent.eventId,
            event_name: lastEvent.eventName,
            end_date: lastEnd.toISOString()
          },
          succeedingEvent: {
            event_id: earliestAfterEnd.eventId,
            event_name: earliestAfterEnd.eventName,
            start_date: afterStart.toISOString()
          }
        });
      }
    }
    
    // Sort gaps by duration (largest first)
    gaps.sort((a, b) => b.durationMinutes - a.durationMinutes);
    
    // If no gaps found
    if (gaps.length === 0) {
      return res.json({
        largestGap: null,
        message: "No temporal gaps found in the specified time range."
      });
    }
    
    // Return the largest gap
    return res.json({
      largestGap: gaps[0],
      message: "Largest temporal gap identified."
    });
    
  } catch (error) {
    console.error('Error finding temporal gaps:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/insights/overlapping-events - Overlapping events analysis
router.get('/overlapping-events', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
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
      return (eventStart < end && eventEnd > start);
    });

    // Find overlapping event pairs
    const overlappingPairs = [];
    
    for (let i = 0; i < filteredEvents.length; i++) {
      for (let j = i + 1; j < filteredEvents.length; j++) {
        const event1 = filteredEvents[i];
        const event2 = filteredEvents[j];
        
        if (eventsOverlap(event1, event2)) {
          const overlapDuration = calculateOverlapDuration(event1, event2);
          
          overlappingPairs.push({
            overlappingEventPairs: [
              {
                event_id: event1.eventId,
                event_name: event1.eventName,
                start_date: event1.startDate,
                end_date: event1.endDate
              },
              {
                event_id: event2.eventId,
                event_name: event2.eventName,
                start_date: event2.startDate,
                end_date: event2.endDate
              }
            ],
            overlap_duration_minutes: overlapDuration
          });
        }
      }
    }

    res.json(overlappingPairs);

  } catch (error) {
    console.error('Error finding overlapping events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/insights/temporal-gaps - Temporal gaps analysis
router.get('/temporal-gaps', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
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
      return (eventStart < end && eventEnd > start);
    });

    if (filteredEvents.length < 2) {
      return res.json({
        largestGap: null,
        message: "No significant temporal gaps found within the specified range, or too few events."
      });
    }

    // Sort events by start date
    filteredEvents.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    let largestGap = null;
    let maxGapDuration = 0;

    // Find gaps between consecutive events
    for (let i = 0; i < filteredEvents.length - 1; i++) {
      const currentEvent = filteredEvents[i];
      const nextEvent = filteredEvents[i + 1];
      
      const currentEnd = new Date(currentEvent.endDate);
      const nextStart = new Date(nextEvent.startDate);
      
      // Calculate gap duration
      const gapDuration = (nextStart - currentEnd) / (1000 * 60); // in minutes
      
      // Only consider gaps that are significant (more than 1 minute)
      if (gapDuration > 1 && gapDuration > maxGapDuration) {
        maxGapDuration = gapDuration;
        largestGap = {
          startOfGap: currentEnd.toISOString(),
          endOfGap: nextStart.toISOString(),
          durationMinutes: Math.round(gapDuration),
          precedingEvent: {
            event_id: currentEvent.eventId,
            event_name: currentEvent.eventName,
            end_date: currentEvent.endDate
          },
          succeedingEvent: {
            event_id: nextEvent.eventId,
            event_name: nextEvent.eventName,
            start_date: nextEvent.startDate
          }
        };
      }
    }

    if (largestGap) {
      res.json({
        largestGap: largestGap,
        message: "Largest temporal gap identified."
      });
    } else {
      res.json({
        largestGap: null,
        message: "No significant temporal gaps found within the specified range, or too few events."
      });
    }

  } catch (error) {
    console.error('Error finding temporal gaps:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to check if two events overlap
function eventsOverlap(event1, event2) {
  const start1 = new Date(event1.startDate);
  const end1 = new Date(event1.endDate);
  const start2 = new Date(event2.startDate);
  const end2 = new Date(event2.endDate);
  
  return (start1 < end2 && end1 > start2);
}

// Helper function to calculate overlap duration
function calculateOverlapDuration(event1, event2) {
  const start1 = new Date(event1.startDate);
  const end1 = new Date(event1.endDate);
  const start2 = new Date(event2.startDate);
  const end2 = new Date(event2.endDate);
  
  const overlapStart = new Date(Math.max(start1, start2));
  const overlapEnd = new Date(Math.min(end1, end2));
  
  return Math.round((overlapEnd - overlapStart) / (1000 * 60)); // in minutes
}

module.exports = router;
