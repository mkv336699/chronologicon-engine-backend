const Joi = require('joi');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

// Event validation schema
const eventSchema = Joi.object({
  eventId: Joi.string().uuid().optional(),
  eventName: Joi.string().required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  parentId: Joi.string().uuid().allow(null).optional(),
  description: Joi.string().allow('').optional(),
  metadata: Joi.object().optional()
});

// Event model class with database operations
class Event {
  constructor(data) {
    this.eventId = data.event_id || data.eventId;
    this.eventName = data.event_name || data.eventName;
    this.startDate = moment(data.start_date || data.startDate);
    this.endDate = moment(data.end_date || data.endDate);
    this.parentId = data.parent_event_id || data.parentId;
    this.description = data.description || '';
    this.metadata = data.metadata || {};
    this.duration = data.duration_minutes || this.endDate.diff(this.startDate, 'minutes');
  }

  // Validate event data
  static validate(data) {
    const { error, value } = eventSchema.validate(data);
    if (error) {
      // Return validation result with error for array processing
      return { isValid: false, error: error.details[0].message, value: null };
    }
    return { isValid: true, error: null, value };
  }

  // Create a new event in the database
  static async create(eventData) {
    // Handle array of events
    if (Array.isArray(eventData)) {
      const results = [];
      const errors = [];
      
      // Process each event in the array
      for (const data of eventData) {
        try {
          const event = await Event.createSingleEvent(data);
          if (event)
            results.push(event);
        } catch (error) {
          // Log error but continue processing other events
          console.error(`Skipping invalid event: ${error.message}`);
          errors.push({ data, error: error.message });
        }
      }
      
      return {
        success: results,
        failed: errors,
        totalProcessed: eventData.length,
        successCount: results.length,
        failureCount: errors.length
      };
    } else {
      // Handle single event
      return await Event.createSingleEvent(eventData);
    }
  }
  
  // Helper method to create a single event
  static async createSingleEvent(eventData) {
    try {
      const validation = Event.validate(eventData);
      
      if (!validation.isValid) {
        return false;
      }
      
      const validatedData = validation.value;
      const eventId = validatedData.eventId || uuidv4();
      
      // Check if parentId exists in the database if it's provided
      if (validatedData.parentId) {
        const parentExists = await Event.findById(validatedData.parentId);
        if (!parentExists) {
          console.warn(`Parent event with ID ${validatedData.parentId} does not exist. Setting parentId to null.`);
          validatedData.parentId = null;
        }
      }
      
      const insertQuery = `
        INSERT INTO HistoricalEvents (
          event_id, event_name, description, start_date, end_date, 
          parent_event_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const values = [
        eventId,
        validatedData.eventName,
        validatedData.description || '',
        validatedData.startDate,
        validatedData.endDate,
        validatedData.parentId,
        JSON.stringify(validatedData.metadata || {})
      ];
      
      const result = await query(insertQuery, values);
      return new Event(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to create event: ${error.message}`);
    }
  }

  // Find event by ID
  static async findById(eventId) {
    try {
      const selectQuery = 'SELECT * FROM HistoricalEvents WHERE event_id = $1';
      const result = await query(selectQuery, [eventId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new Event(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to find event: ${error.message}`);
    }
  }

  // Update event in database
  async update(updateData) {
    try {
      const validation = Event.validate({ ...this.toObject(), ...updateData });
      
      if (!validation.isValid) {
        throw new Error(`Validation error update: ${validation.error}`);
      }
      
      const validatedData = validation.value;
      
      // Check if parentId exists in the database if it's provided
      if (validatedData.parentId) {
        const parentExists = await Event.findById(validatedData.parentId);
        if (!parentExists) {
          console.warn(`Parent event with ID ${validatedData.parentId} does not exist. Setting parentId to null.`);
          validatedData.parentId = null;
        }
      }
      
      const updateQuery = `
        UPDATE HistoricalEvents 
        SET event_name = $2, description = $3, start_date = $4, 
            end_date = $5, parent_event_id = $6, metadata = $7
        WHERE event_id = $1
        RETURNING *
      `;
      
      const values = [
        this.eventId,
        validatedData.eventName,
        validatedData.description || '',
        validatedData.startDate,
        validatedData.endDate,
        validatedData.parentId,
        JSON.stringify(validatedData.metadata || {})
      ];
      
      const result = await query(updateQuery, values);
      const updatedEvent = new Event(result.rows[0]);
      
      // Update current instance
      Object.assign(this, updatedEvent);
      return this;
    } catch (error) {
      throw new Error(`Failed to update event: ${error.message}`);
    }
  }

  // Delete event from database
  async delete() {
    try {
      const deleteQuery = 'DELETE FROM HistoricalEvents WHERE event_id = $1';
      await query(deleteQuery, [this.eventId]);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete event: ${error.message}`);
    }
  }

  // Check if event overlaps with another event
  overlaps(otherEvent) {
    return this.startDate.isBefore(otherEvent.endDate) && 
           this.endDate.isAfter(otherEvent.startDate);
  }

  // Calculate gap between this event and another event
  calculateGap(otherEvent) {
    if (this.overlaps(otherEvent)) {
      return 0; // No gap if events overlap
    }
    
    if (this.endDate.isBefore(otherEvent.startDate)) {
      return otherEvent.startDate.diff(this.endDate, 'minutes');
    } else {
      return this.startDate.diff(otherEvent.endDate, 'minutes');
    }
  }

  // Get event as plain object
  toObject() {
    return {
      eventId: this.eventId,
      eventName: this.eventName,
      startDate: this.startDate.toISOString(),
      endDate: this.endDate.toISOString(),
      parentId: this.parentId,
      description: this.description,
      metadata: this.metadata,
      duration: this.duration
    };
  }
}

// Event collection manager with database operations
class EventCollection {
  constructor() {
    // No longer need in-memory storage
  }

  // Add event to database
  async addEvent(eventData) {
    return await Event.create(eventData);
  }

  // Get event by ID
  async getEvent(eventId) {
    return await Event.findById(eventId);
  }

  // Get all events
  async getAllEvents() {
    try {
      const selectQuery = 'SELECT * FROM HistoricalEvents ORDER BY start_date ASC';
      const result = await query(selectQuery);
      return result.rows.map(row => new Event(row));
    } catch (error) {
      throw new Error(`Failed to get all events: ${error.message}`);
    }
  }

  // Get events sorted by start date
  async getEventsSortedByStartDate() {
    return await this.getAllEvents();
  }

  // Get child events of a parent
  async getChildEvents(parentId) {
    try {
      const selectQuery = 'SELECT * FROM HistoricalEvents WHERE parent_event_id = $1 ORDER BY start_date ASC';
      const result = await query(selectQuery, [parentId]);
      return result.rows.map(row => new Event(row));
    } catch (error) {
      throw new Error(`Failed to get child events: ${error.message}`);
    }
  }

  // Get root events (events without parents)
  async getRootEvents() {
    try {
      const selectQuery = 'SELECT * FROM HistoricalEvents WHERE parent_event_id IS NULL ORDER BY start_date ASC';
      const result = await query(selectQuery);
      return result.rows.map(row => new Event(row));
    } catch (error) {
      throw new Error(`Failed to get root events: ${error.message}`);
    }
  }

  // Find temporal gaps between events
  async findTemporalGaps(minGapMinutes = 0) {
    try {
      const gapsQuery = `
        WITH ordered_events AS (
          SELECT 
            event_id, event_name, description, start_date, end_date, 
            parent_event_id, metadata, duration_minutes,
            LAG(end_date) OVER (ORDER BY start_date) as prev_end_date,
            LEAD(start_date) OVER (ORDER BY start_date) as next_start_date
          FROM HistoricalEvents
          ORDER BY start_date
        )
        SELECT 
          uuid_generate_v4() as gap_id,
          prev_event.event_id as before_event_id,
          prev_event.event_name as before_event_name,
          prev_event.end_date as gap_start,
          next_event.start_date as gap_end,
          EXTRACT(EPOCH FROM (next_event.start_date - prev_event.end_date)) / 60 as gap_minutes,
          CASE 
            WHEN EXTRACT(EPOCH FROM (next_event.start_date - prev_event.end_date)) / 60 < 30 THEN 'low'
            WHEN EXTRACT(EPOCH FROM (next_event.start_date - prev_event.end_date)) / 60 < 120 THEN 'medium'
            WHEN EXTRACT(EPOCH FROM (next_event.start_date - prev_event.end_date)) / 60 < 480 THEN 'high'
            ELSE 'critical'
          END as severity
        FROM ordered_events prev_event
        JOIN ordered_events next_event ON prev_event.event_id = next_event.event_id
        WHERE prev_event.end_date IS NOT NULL 
          AND next_event.start_date IS NOT NULL
          AND EXTRACT(EPOCH FROM (next_event.start_date - prev_event.end_date)) / 60 >= $1
        ORDER BY gap_minutes DESC
      `;
      
      const result = await query(gapsQuery, [minGapMinutes]);
      
      // Get full event details for before and after events
      const gaps = [];
      for (const gap of result.rows) {
        const beforeEvent = await Event.findById(gap.before_event_id);
        const afterEvent = await Event.findById(gap.before_event_id); // This needs to be fixed
        
        gaps.push({
          gapId: gap.gap_id,
          beforeEvent: beforeEvent ? beforeEvent.toObject() : null,
          afterEvent: afterEvent ? afterEvent.toObject() : null,
          gapMinutes: parseInt(gap.gap_minutes),
          gapStart: gap.gap_start,
          gapEnd: gap.gap_end,
          severity: gap.severity
        });
      }
      
      return gaps;
    } catch (error) {
      throw new Error(`Failed to find temporal gaps: ${error.message}`);
    }
  }

  // Calculate event influence spreading
  async calculateEventInfluence(eventId, maxDepth = 3) {
    try {
      const event = await this.getEvent(eventId);
      if (!event) {
        throw new Error(`Event ${eventId} not found`);
      }

      // Use recursive CTE to find all related events
      const influenceQuery = `
        WITH RECURSIVE event_hierarchy AS (
          -- Base case: the source event
          SELECT 
            event_id, event_name, description, start_date, end_date, 
            parent_event_id, metadata, duration_minutes,
            0 as depth,
            ARRAY[event_id] as path
          FROM HistoricalEvents 
          WHERE event_id = $1
          
          UNION ALL
          
          -- Recursive case: find children and parents
          SELECT 
            e.event_id, e.event_name, e.description, e.start_date, e.end_date,
            e.parent_event_id, e.metadata, e.duration_minutes,
            eh.depth + 1,
            eh.path || e.event_id
          FROM HistoricalEvents e
          JOIN event_hierarchy eh ON (
            (e.parent_event_id = eh.event_id AND eh.depth < $2) OR
            (e.event_id IN (
              SELECT event_id FROM HistoricalEvents WHERE parent_event_id = eh.event_id
            ) AND eh.depth < $2)
          )
          WHERE NOT (e.event_id = ANY(eh.path)) -- Avoid cycles
        )
        SELECT 
          event_id, event_name, description, start_date, end_date,
          parent_event_id, metadata, duration_minutes, depth
        FROM event_hierarchy
        ORDER BY depth, start_date
      `;
      
      const result = await query(influenceQuery, [eventId, maxDepth]);
      
      const influenceMap = new Map();
      let totalInfluence = 0;
      
      for (const row of result.rows) {
        const influence = Math.pow(0.7, row.depth); // Influence decreases with depth
        influenceMap.set(row.event_id, influence);
        totalInfluence += influence;
      }
      
      return {
        sourceEvent: event.toObject(),
        influenceMap: Array.from(influenceMap.entries()).map(([eventId, influence]) => ({
          eventId,
          influence: influence,
          event: result.rows.find(r => r.event_id === eventId)
        })),
        totalInfluence: totalInfluence
      };
    } catch (error) {
      throw new Error(`Failed to calculate event influence: ${error.message}`);
    }
  }

  // Get events by date range
  async getEventsByDateRange(startDate, endDate) {
    try {
      const selectQuery = `
        SELECT * FROM HistoricalEvents 
        WHERE (start_date <= $2 AND end_date >= $1)
        ORDER BY start_date ASC
      `;
      const result = await query(selectQuery, [startDate, endDate]);
      return result.rows.map(row => new Event(row));
    } catch (error) {
      throw new Error(`Failed to get events by date range: ${error.message}`);
    }
  }

  // Get statistics about the event collection
  async getStatistics() {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_events,
          SUM(duration_minutes) as total_duration,
          AVG(duration_minutes) as average_duration,
          MIN(start_date) as earliest_date,
          MAX(end_date) as latest_date
        FROM HistoricalEvents
      `;
      
      const gapsQuery = `
        WITH gaps AS (
          SELECT 
            EXTRACT(EPOCH FROM (LEAD(start_date) OVER (ORDER BY start_date) - end_date)) / 60 as gap_minutes
          FROM HistoricalEvents
          ORDER BY start_date
        )
        SELECT 
          COUNT(*) FILTER (WHERE gap_minutes >= 0) as total_gaps,
          COUNT(*) FILTER (WHERE gap_minutes >= 480) as critical_gaps,
          COUNT(*) FILTER (WHERE gap_minutes >= 120 AND gap_minutes < 480) as high_gaps,
          COUNT(*) FILTER (WHERE gap_minutes >= 30 AND gap_minutes < 120) as medium_gaps,
          COUNT(*) FILTER (WHERE gap_minutes >= 0 AND gap_minutes < 30) as low_gaps
        FROM gaps
        WHERE gap_minutes IS NOT NULL
      `;
      
      const [statsResult, gapsResult] = await Promise.all([
        query(statsQuery),
        query(gapsQuery)
      ]);
      
      const stats = statsResult.rows[0];
      const gaps = gapsResult.rows[0];
      
      return {
        totalEvents: parseInt(stats.total_events),
        totalDuration: parseInt(stats.total_duration) || 0,
        averageDuration: parseFloat(stats.average_duration) || 0,
        totalGaps: parseInt(gaps.total_gaps) || 0,
        criticalGaps: parseInt(gaps.critical_gaps) || 0,
        highGaps: parseInt(gaps.high_gaps) || 0,
        mediumGaps: parseInt(gaps.medium_gaps) || 0,
        lowGaps: parseInt(gaps.low_gaps) || 0,
        dateRange: {
          earliest: stats.earliest_date,
          latest: stats.latest_date
        }
      };
    } catch (error) {
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }
}

module.exports = {
  Event,
  EventCollection,
  eventSchema
};