-- PostgreSQL Schema for HistoricalEvents Table
-- This schema follows the exact specifications provided

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the HistoricalEvents table
CREATE TABLE HistoricalEvents (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (end_date - start_date)) / 60
    ) STORED,
    parent_event_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Add constraints
    CONSTRAINT fk_parent_event 
        FOREIGN KEY (parent_event_id) 
        REFERENCES HistoricalEvents(event_id) 
        ON DELETE SET NULL,
    
    -- Ensure end_date is after start_date
    CONSTRAINT check_end_after_start 
        CHECK (end_date > start_date),
    
    -- Ensure duration is positive
    CONSTRAINT check_positive_duration 
        CHECK (duration_minutes > 0)
);

-- Create indexes for performance optimization
-- CREATE INDEX idx_historical_events_start_date ON HistoricalEvents(start_date);
-- CREATE INDEX idx_historical_events_end_date ON HistoricalEvents(end_date);
-- CREATE INDEX idx_historical_events_parent_event_id ON HistoricalEvents(parent_event_id);
-- CREATE INDEX idx_historical_events_duration ON HistoricalEvents(duration_minutes);

-- Create composite index for date range queries
-- CREATE INDEX idx_historical_events_date_range ON HistoricalEvents(start_date, end_date);

-- Create GIN index for JSONB metadata field for efficient JSON queries
-- CREATE INDEX idx_historical_events_metadata ON HistoricalEvents USING GIN(metadata);

-- Add comments for documentation
-- COMMENT ON TABLE HistoricalEvents IS 'Stores historical events with hierarchical relationships and temporal data';
-- COMMENT ON COLUMN HistoricalEvents.event_id IS 'Primary key - unique identifier for each event';
-- COMMENT ON COLUMN HistoricalEvents.event_name IS 'Name/title of the historical event';
-- COMMENT ON COLUMN HistoricalEvents.description IS 'Detailed description of the event (nullable)';
-- COMMENT ON COLUMN HistoricalEvents.start_date IS 'Event start timestamp with timezone (indexed)';
-- COMMENT ON COLUMN HistoricalEvents.end_date IS 'Event end timestamp with timezone (indexed)';
-- COMMENT ON COLUMN HistoricalEvents.duration_minutes IS 'Calculated duration in minutes (generated column)';
-- COMMENT ON COLUMN HistoricalEvents.parent_event_id IS 'Foreign key to parent event for hierarchical relationships';
-- COMMENT ON COLUMN HistoricalEvents.metadata IS 'JSON field for additional unstructured data';

-- Example queries for common operations:

-- Insert a new event
/*
INSERT INTO HistoricalEvents (event_name, description, start_date, end_date, parent_event_id, metadata)
VALUES (
    'World War II',
    'Global military conflict from 1939 to 1945',
    '1939-09-01 00:00:00+00',
    '1945-09-02 00:00:00+00',
    NULL,
    '{"source": "history_textbook", "confidence": 0.95, "tags": ["war", "global"]}'::jsonb
);
*/

-- Find events within a date range
/*
SELECT event_id, event_name, start_date, end_date, duration_minutes
FROM HistoricalEvents
WHERE start_date >= '1940-01-01'::timestamptz 
  AND end_date <= '1950-12-31'::timestamptz
ORDER BY start_date;
*/

-- Find child events of a parent
/*
SELECT child.event_id, child.event_name, child.start_date, child.end_date
FROM HistoricalEvents parent
JOIN HistoricalEvents child ON child.parent_event_id = parent.event_id
WHERE parent.event_name = 'World War II';
*/

-- Find events with specific metadata
/*
SELECT event_id, event_name, metadata
FROM HistoricalEvents
WHERE metadata @> '{"tags": ["war"]}'::jsonb;
*/
