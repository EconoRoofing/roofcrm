ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_failed_attempts integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz;
