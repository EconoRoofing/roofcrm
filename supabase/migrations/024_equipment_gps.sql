ALTER TABLE equipment ADD COLUMN IF NOT EXISTS last_lat double precision;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS last_lng double precision;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS last_location_at timestamptz;

ALTER TABLE equipment_logs ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE equipment_logs ADD COLUMN IF NOT EXISTS longitude double precision;
