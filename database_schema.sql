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
