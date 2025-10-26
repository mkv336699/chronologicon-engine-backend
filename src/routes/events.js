const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { EventCollection, Event } = require('../models/Event');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// In-memory storage for ingestion jobs (in production, use Redis or database)
const ingestionJobs = new Map();

// Create EventCollection instance
const eventCollection = new EventCollection();

// POST /api/events/ingest - Data ingestion endpoint
router.post('/ingest', upload.single('file'), async (req, res) => {
  try {
    const jobId = `ingest-job-${uuidv4()}`;
    
    // Initialize job status
    ingestionJobs.set(jobId, {
      status: 'PROCESSING',
      processedLines: 0,
      errorLines: 0,
      totalLines: 0,
      errors: [],
      startTime: new Date().toISOString(),
      endTime: null
    });

    // Handle file path from request body (server file path)
    let filePath;
    if (req.body.filePath) {
      filePath = req.body.filePath;
    } else if (req.file) {
      filePath = req.file.path;
    } else {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Process file asynchronously
    processFileAsync(jobId, filePath);

    res.status(202).json({
      status: "Ingestion initiated",
      jobId: jobId,
      message: `Check /api/events/ingestion-status/${jobId} for updates.`
    });

  } catch (error) {
    console.error('Error initiating ingestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/events/ingestion-status/:jobId - Ingestion status endpoint
router.get('/ingestion-status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = ingestionJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);

  } catch (error) {
    console.error('Error fetching ingestion status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/timeline/:rootEventId - Hierarchical timeline endpoint
router.get('/timeline/:rootEventId', async (req, res) => {
  try {
    const { rootEventId } = req.params;
    console.log("rootEventId", rootEventId)
    
    // Get the event
    const event = await eventCollection.getEvent(rootEventId);
    console.log("timeline", event)

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Build hierarchical timeline
    const timeline = await buildHierarchicalTimeline(event, eventCollection);
    console.log("timeline", timeline)
    res.json(timeline);

  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/events/search - Event search endpoint
router.get('/search', async (req, res) => {
  try {
    const {
      name,
      start_date_after,
      end_date_before,
      sortBy = 'start_date',
      sortOrder = 'asc',
      page = 1,
      limit = 10
    } = req.query;

    let events = await eventCollection.getAllEvents();

    // Apply filters
    if (name) {
      events = events.filter(event => 
        event.eventName.toLowerCase().includes(name.toLowerCase())
      );
    }

    if (start_date_after) {
      const startDate = new Date(start_date_after);
      events = events.filter(event => new Date(event.startDate) >= startDate);
    }

    if (end_date_before) {
      const endDate = new Date(end_date_before);
      events = events.filter(event => new Date(event.endDate) <= endDate);
    }

    // Apply sorting
    events.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'start_date':
          aValue = new Date(a.startDate);
          bValue = new Date(b.startDate);
          break;
        case 'event_name':
          aValue = a.eventName;
          bValue = b.eventName;
          break;
        default:
          aValue = new Date(a.startDate);
          bValue = new Date(b.startDate);
      }

      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    // Apply pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedEvents = events.slice(startIndex, endIndex);

    // Format response
    const response = {
      totalEvents: events.length,
      page: pageNum,
      limit: limitNum,
      events: paginatedEvents.map(event => ({
        event_id: event.eventId,
        event_name: event.eventName
      }))
    };

    res.json(response);

  } catch (error) {
    console.error('Error searching events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to process file asynchronously
async function processFileAsync(jobId, filePath) {
  try {
    const job = ingestionJobs.get(jobId);
    if (!job) return;

    // Read file content
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    job.totalLines = lines.length;
    job.processedLines = 0;
    job.errorLines = 0;
    job.errors = [];

    // Use the global eventCollection instance

    for (let i = 0; i < lines.length; i++) {
      try {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse line (assuming pipe-separated format)
        const parts = line.split('|');
        if (parts.length < 6) {
          throw new Error(`Missing fields. Expected 6 fields, got ${parts.length}`);
        }

        const [eventId, eventName, startDate, endDate, parentId, description] = parts;
        
        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw new Error(`Invalid date format`);
        }

        // Create event
        const event = {
          eventId: eventId.trim(),
          eventName: eventName.trim(),
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          parentId: parentId.trim() === 'NULL' ? null : parentId.trim(),
          description: description.trim()
        };

        eventCollection.addEvent(event);
        job.processedLines++;

      } catch (lineError) {
        job.errorLines++;
        job.errors.push(`Line ${i + 1}: ${lineError.message}`);
      }
    }

    // Mark job as completed
    job.status = 'COMPLETED';
    job.endTime = new Date().toISOString();

  } catch (error) {
    const job = ingestionJobs.get(jobId);
    if (job) {
      job.status = 'FAILED';
      job.errors.push(`File processing error: ${error.message}`);
      job.endTime = new Date().toISOString();
    }
  }
}

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

module.exports = router;