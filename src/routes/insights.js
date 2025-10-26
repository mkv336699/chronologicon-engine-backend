const express = require('express');
const { EventCollection } = require('../models/Event');

const router = express.Router();

/**
 * Finds the shortest path between two events based on their timing
 * 
 * This uses a breadth-first search to find how events might be connected
 * through time. We're looking for chains where one event could potentially
 * influence another based on when they happened.
 */
async function findShortestPath(sourceEventId, targetEventId, eventCollection) {
  // Grab all our events
  const events = await eventCollection.getAllEvents();
  
  // Set up our network of events
  const graph = {};
  
  // Every event starts with no connections
  events.forEach(event => {
    graph[event.eventId] = [];
  });
  
  // Now let's connect events that could influence each other
  // An event can only influence something that happens after it
  events.forEach(event1 => {
    const event1End = new Date(event1.endDate || event1.startDate);
    
    events.forEach(event2 => {
      // Don't connect an event to itself
      if (event1.eventId !== event2.eventId) {
        const event2Start = new Date(event2.startDate);
        
        // If the first event ends before the second one starts,
        // there might be a connection
        if (event1End <= event2Start) {
          graph[event1.eventId].push(event2.eventId);
        }
      }
    });
  });
  
  // Let's use BFS to find the shortest path through our event network
  const queue = [{ eventId: sourceEventId, path: [sourceEventId] }];
  const visited = new Set([sourceEventId]); // Track what we've already seen
  
  while (queue.length > 0) {
    const { eventId, path } = queue.shift();
    
    // Did we find what we're looking for?
    if (eventId === targetEventId) {
      // Bingo! Now let's format the path nicely
      const pathEvents = [];
      
      // Convert each ID in the path to a full event object
      path.forEach(id => {
        const event = events.find(e => e.eventId === id);
        if (event) {
          // Figure out how long this event lasted
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
      });
      
      return pathEvents;
    }
    
    // Check all the connected events we haven't seen yet
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
  
  // Couldn't find a path between these events
  return [];
}

// Create EventCollection instance
const eventCollection = new EventCollection();

// GET /api/insights/event-influence - See how events affect each other
// This endpoint shows connections between events based on when they happened
router.get('/event-influence', async (req, res) => {
  try {
    const { sourceEventId, targetEventId } = req.query;
    
    // If they want to see the connection between two specific events
    if (sourceEventId && targetEventId) {
      // Make sure both events actually exist
      const events = await eventCollection.getAllEvents();
      const sourceEvent = events.find(event => event.eventId === sourceEventId);
      const targetEvent = events.find(event => event.eventId === targetEventId);
      
      if (!sourceEvent) {
        return res.status(404).json({ error: 'Sorry, we couldn\'t find that source event' });
      }
      
      if (!targetEvent) {
        return res.status(404).json({ error: 'Sorry, we couldn\'t find that target event' });
      }
      
      // Find the shortest way these events might be connected
      const shortestPath = await findShortestPath(sourceEventId, targetEventId, eventCollection);
      
      // If there's no connection between them
      if (shortestPath.length === 0) {
        return res.json({
          sourceEventId: sourceEventId,
          targetEventId: targetEventId,
          shortestPath: [],
          totalDurationMinutes: 0,
          message: "These events don't seem to be connected through time."
        });
      }

      // Add up how long all the events in the path took
      const totalDurationMinutes = shortestPath.reduce((total, event) => {
        return total + event.duration_minutes;
      }, 0);

      return res.json({
        sourceEventId: sourceEventId,
        targetEventId: targetEventId,
        shortestPath: shortestPath,
        totalDurationMinutes: totalDurationMinutes,
        message: "Found a connection between these events!"
      });
    }
    
    // If they just want to see what a single event might influence
    if (sourceEventId) {
      const events = await eventCollection.getAllEvents();
      
      // Find the event they're asking about
      const sourceEvent = events.find(event => event.eventId === sourceEventId);
      
      if (!sourceEvent) {
        return res.status(404).json({ error: 'We couldn\'t find that event' });
      }
      
      // Figure out how this event might relate to others based on timing
      const influencedEvents = events
        .filter(event => event.eventId !== sourceEventId) // Don't include the event itself
        .map(event => {
          const sourceStart = new Date(sourceEvent.startDate);
          const eventStart = new Date(event.startDate);
          
          // How many days apart are these events?
          const timeDifference = Math.abs(eventStart - sourceStart) / (1000 * 60 * 60 * 24);
          
          // Events that happened closer together have stronger connections
          // The formula gives us a score from 0-100
          const influenceScore = timeDifference === 0 ? 100 : 100 / (1 + timeDifference);
          
          return {
            event_id: event.eventId,
            event_name: event.eventName,
            influence_score: Math.round(influenceScore),
            temporal_distance_days: Math.round(timeDifference * 10) / 10
          };
        })
        .sort((a, b) => b.influence_score - a.influence_score); // Show strongest connections first
      
      return res.json({
        source_event: {
          event_id: sourceEvent.eventId,
          event_name: sourceEvent.eventName
        },
        influenced_events: influencedEvents
      });
    }
    
    // They didn't give us enough information to work with
    return res.status(400).json({ 
      error: 'Please provide at least a sourceEventId so we know which event to analyze' 
    });

  } catch (error) {
    console.error('Problem with event influence calculation:', error);
    res.status(500).json({ error: 'Something went wrong on our end. Please try again later.' });
  }
});

// GET /api/insights/event-influence-path - Find the shortest path between events
router.get('/event-influence-path', async (req, res) => {
  try {
    const { sourceEventId, targetEventId } = req.query;
    
    // We need both events to find a path between them
    if (!sourceEventId || !targetEventId) {
      return res.status(400).json({ 
        error: 'We need both a source and target event ID to find a path between them' 
      });
    }

    // Let's make sure both events actually exist
    const sourceEvent = await eventCollection.getEvent(sourceEventId);
    const targetEvent = await eventCollection.getEvent(targetEventId);
    
    if (!sourceEvent) {
      return res.status(404).json({ error: 'We couldn\'t find your source event' });
    }
    
    if (!targetEvent) {
      return res.status(404).json({ error: 'We couldn\'t find your target event' });
    }

    // Now let's find the shortest path between these events
    const shortestPath = await findShortestPath(sourceEventId, targetEventId, eventCollection);
    
    // If there's no path between them
    if (shortestPath.length === 0) {
      return res.json({
        sourceEventId: sourceEventId,
        targetEventId: targetEventId,
        shortestPath: [],
        totalDurationMinutes: 0,
        message: "We couldn't find any connection between these events."
      });
    }

    // Add up the total duration of all events in the path
    const totalDurationMinutes = shortestPath.reduce((total, event) => {
      return total + event.duration_minutes;
    }, 0);

    res.json({
      sourceEventId: sourceEventId,
      targetEventId: targetEventId,
      shortestPath: shortestPath,
      totalDurationMinutes: totalDurationMinutes,
      message: "We found the shortest path between your events!"
    });

  } catch (error) {
    console.error('Problem finding path between events:', error);
    res.status(500).json({ error: 'Something went wrong while mapping the connection between events. Please try again.' });
  }
});

// GET /api/insights/temporal-gaps - Find the gaps in your timeline
router.get('/temporal-gaps', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Make sure we have the dates we need
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'We need both a start and end date to find gaps in your timeline' 
      });
    }

    // Convert the string dates to actual Date objects
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Check if the dates make sense
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Those dates don\'t look right. Try using YYYY-MM-DD format.' });
    }
    
    // Grab all our events so we can look at the whole timeline
    const events = await eventCollection.getAllEvents();
    
    // We need to find events just outside our date range too
    let mostRecentBeforeStart = null; // The last thing that happened before our start date
    let earliestAfterEnd = null;      // The first thing that happened after our end date
    
    events.forEach(event => {
      const eventEnd = new Date(event.endDate || event.startDate);
      const eventStart = new Date(event.startDate);
      
      // Look for the most recent event that ended before or right at our start date
      if (eventEnd <= start) {
        if (!mostRecentBeforeStart || eventEnd > new Date(mostRecentBeforeStart.endDate || mostRecentBeforeStart.startDate)) {
          mostRecentBeforeStart = event;
        }
      }
      
      // Look for the earliest event that started after or right at our end date
      if (eventStart >= end) {
        if (!earliestAfterEnd || eventStart < new Date(earliestAfterEnd.startDate)) {
          earliestAfterEnd = event;
        }
      }
    });
    
    // Now let's find all events that fall completely within our date range
    const filteredEvents = events.filter(event => {
      const eventStart = new Date(event.startDate);
      const eventEnd = new Date(event.endDate || event.startDate);
      return eventStart >= start && eventEnd <= end;
    });
    
    // Put them in chronological order
    filteredEvents.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    
    // Let's look for gaps in the timeline
    const gaps = [];
    
    // First, check if there's a gap between our "before" event and the first event in our range
    if (mostRecentBeforeStart && filteredEvents.length > 0) {
      const beforeEnd = new Date(mostRecentBeforeStart.endDate || mostRecentBeforeStart.startDate);
      const firstStart = new Date(filteredEvents[0].startDate);
      
      // Is there actually a gap here?
      if (beforeEnd < firstStart) {
        // Calculate how long the gap is in minutes
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
        message: "Looks like your timeline is pretty solid! We didn't find any gaps in this date range."
      });
    }
    
    // Return the largest gap
    return res.json({
      largestGap: gaps[0],
      message: "Largest temporal gap identified."
    });
    
  } catch (error) {
    console.error('Problem finding gaps in timeline:', error);
    res.status(500).json({ error: 'Something went wrong while analyzing your timeline. Please try again.' });
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
