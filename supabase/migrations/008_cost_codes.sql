-- Add cost_code to time_entries
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS cost_code text DEFAULT 'labor';

-- Predefined cost codes for roofing:
-- labor, supervision, travel, cleanup, warranty_repair, inspection
