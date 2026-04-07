-- Add calendar_deleted flag to jobs table
-- Set when Google Calendar push webhook detects an event was deleted externally.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calendar_deleted boolean NOT NULL DEFAULT false;
