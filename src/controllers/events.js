const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { EventCollection } = require('../models/Event');

// Global event collection instance
let eventCollection = new EventCollection();

// Load sample data on startup
const loadSampleData = async () => {
  const csvPath = path.join(__dirname, '../../sample-data.csv');
  
  if (fs.existsSync(csvPath)) {
    const events = [];
    
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        try {
          // Skip malformed rows
          if (row.eventId && row.eventName && row.startDate && row.endDate) {
            // Clean up the data
            const cleanRow = {
              eventId: row.eventId.trim(),
              eventName: row.eventName.trim(),
              startDate: row.startDate.trim(),
              endDate: row.endDate.trim(),
              parentId: row.parentId && row.parentId !== 'NULL' ? row.parentId.trim() : null,
              description: row.description ? row.description.trim() : '',
              metadata: {
                source: 'sample-data.csv'
              }
            };
            
            events.push(cleanRow);
          }
        } catch (error) {
          console.warn(`Skipping malformed row: ${JSON.stringify(row)}`);
        }
      })
      .on('end', async () => {
        // Add valid events to collection
        let addedCount = 0;
        for (const eventData of events) {
          try {
            await eventCollection.addEvent(eventData);
            addedCount++;
          } catch (error) {
            console.warn(`Failed to add event ${eventData.eventId}: ${error.message}`);
          }
        }
        
        console.log(`Loaded ${addedCount} events from sample data`);
      });
  }
};

// Initialize sample data
loadSampleData();

// Get all events with sorting and pagination
const getAllEvents = async (query) => {
  const { sortBy = 'startDate', order = 'asc', limit, offset } = query;
  let events = await eventCollection.getAllEvents();
  
  // Sort events
  if (sortBy === 'startDate') {
    events = events.sort((a, b) => {
      const diff = a.startDate.diff(b.startDate);
      return order === 'desc' ? -diff : diff;
    });
  }
  
  // Apply pagination
  const startIndex = offset ? parseInt(offset) : 0;
  const endIndex = limit ? startIndex + parseInt(limit) : events.length;
  const paginatedEvents = events.slice(startIndex, endIndex);
  
  return {
    events: paginatedEvents.map(event => event.toObject()),
    total: events.length,
    limit: limit ? parseInt(limit) : events.length,
    offset: startIndex
  };
};

// Get specific event by ID
const getEventById = async (id) => {
  const event = await eventCollection.getEvent(id);
  if (!event) {
    throw new Error('Event not found');
  }
  return event.toObject();
};

// Create new event
const createEvent = async (eventData) => {
  const event = await eventCollection.addEvent(eventData);
  return event.toObject();
};

// Update existing event
const updateEvent = async (id, eventData) => {
  const existingEvent = await eventCollection.getEvent(id);
  if (!existingEvent) {
    throw new Error('Event not found');
  }
  
  const updatedEvent = await existingEvent.update({
    ...eventData,
    eventId: id
  });
  
  return updatedEvent.toObject();
};

// Delete event
const deleteEvent = async (id) => {
  const event = await eventCollection.getEvent(id);
  if (!event) {
    throw new Error('Event not found');
  }
  
  await event.delete();
  return true;
};

// Get child events
const getChildEvents = async (id) => {
  const childEvents = await eventCollection.getChildEvents(id);
  return childEvents.map(event => event.toObject());
};

// Get events in date range
const getEventsByDateRange = async (startDate, endDate) => {
  const events = await eventCollection.getEventsByDateRange(startDate, endDate);
  return events.map(event => event.toObject());
};

// Get event collection statistics
const getStatistics = async () => {
  return await eventCollection.getStatistics();
};

// Get the event collection instance (for sharing with other controllers)
const getEventCollection = () => {
  return eventCollection;
};

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getChildEvents,
  getEventsByDateRange,
  getStatistics,
  getEventCollection
};
