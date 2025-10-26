const express = require('express');
const { EventCollection } = require('../models/Event');

const router = express.Router();

// Create EventCollection instance
const eventCollection = new EventCollection();

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
