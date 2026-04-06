-- Pay type enum
CREATE TYPE pay_type AS ENUM ('hourly', 'day_rate');
CREATE TYPE break_type AS ENUM ('meal', 'rest');

-- Add fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS pay_type pay_type DEFAULT 'hourly';
ALTER TABLE users ADD COLUMN IF NOT EXISTS hourly_rate decimal DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS day_rate decimal DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_rate decimal DEFAULT 0;

-- Add lat/lng to jobs for geofencing
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lat decimal;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lng decimal;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS commission_rate decimal;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS commission_amount decimal;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS insurance_claim boolean DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS insurance_company text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS claim_number text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS claim_status text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deductible decimal;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS warranty_expiration date;

-- Time entries table
CREATE TABLE time_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) NOT NULL,
  job_id uuid REFERENCES jobs(id) NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_in_lat decimal,
  clock_in_lng decimal,
  clock_in_distance_ft integer,
  clock_in_photo_url text,
  clock_out timestamptz,
  clock_out_lat decimal,
  clock_out_lng decimal,
  clock_out_photo_url text,
  pay_type pay_type NOT NULL DEFAULT 'hourly',
  hourly_rate decimal DEFAULT 0,
  day_rate decimal DEFAULT 0,
  regular_hours decimal DEFAULT 0,
  overtime_hours decimal DEFAULT 0,
  doubletime_hours decimal DEFAULT 0,
  total_hours decimal DEFAULT 0,
  total_cost decimal DEFAULT 0,
  weather_conditions text,
  notes text,
  flagged boolean DEFAULT false,
  flag_reason text,
  created_at timestamptz DEFAULT now()
);

-- Breaks table
CREATE TABLE breaks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  time_entry_id uuid REFERENCES time_entries(id) ON DELETE CASCADE NOT NULL,
  type break_type NOT NULL,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  duration_minutes integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_time_entries_user ON time_entries(user_id);
CREATE INDEX idx_time_entries_job ON time_entries(job_id);
CREATE INDEX idx_time_entries_date ON time_entries(clock_in);
CREATE INDEX idx_breaks_entry ON breaks(time_entry_id);

-- RLS
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE breaks ENABLE ROW LEVEL SECURITY;

-- Manager sees all time entries
CREATE POLICY "time_entries_manager" ON time_entries FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

-- Crew sees own entries only
CREATE POLICY "time_entries_own" ON time_entries FOR ALL USING (user_id = auth.uid());

-- Breaks follow same pattern
CREATE POLICY "breaks_manager" ON breaks FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

CREATE POLICY "breaks_own" ON breaks FOR ALL USING (
  time_entry_id IN (SELECT id FROM time_entries WHERE user_id = auth.uid())
);

-- Storage bucket for clock-in photos
INSERT INTO storage.buckets (id, name, public) VALUES ('clock-photos', 'clock-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "clock_photos_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'clock-photos' AND auth.role() = 'authenticated');

CREATE POLICY "clock_photos_read_own" ON storage.objects FOR SELECT
  USING (bucket_id = 'clock-photos' AND (auth.uid()::text = (storage.foldername(name))[1]));

CREATE POLICY "clock_photos_read_manager" ON storage.objects FOR SELECT
  USING (bucket_id = 'clock-photos' AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));
