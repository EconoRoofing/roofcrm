-- Enums
CREATE TYPE user_role AS ENUM ('manager', 'sales', 'crew', 'sales_crew');
CREATE TYPE job_status AS ENUM ('lead', 'estimate_scheduled', 'pending', 'sold', 'scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE job_type AS ENUM ('reroof', 'repair', 'maintenance', 'inspection', 'coating', 'new_construction', 'gutters', 'other');

-- Companies
CREATE TABLE companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  logo_url text,
  address text,
  phone text,
  license_number text,
  color text NOT NULL
);

INSERT INTO companies (name, color, address, phone, license_number) VALUES
  ('Econo Roofing', '#448aff', '16721 Letteau Ave, Delhi CA 95315', '209.668.6222', '749551'),
  ('DeHart Roofing', '#ffab00', '', '', ''),
  ('Nushake Roofing', '#b388ff', '', '', '');

-- Users
CREATE TABLE users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role user_role NOT NULL DEFAULT 'crew',
  avatar_url text,
  default_maps_app text DEFAULT 'apple_maps',
  google_refresh_token text,
  created_at timestamptz DEFAULT now()
);

-- Jobs
CREATE TABLE jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_number text UNIQUE NOT NULL,
  company_id uuid REFERENCES companies(id) NOT NULL,
  status job_status NOT NULL DEFAULT 'lead',
  customer_name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  state text DEFAULT 'CA',
  zip text,
  phone text,
  contact_name text,
  email text,
  referred_by text,
  rep_id uuid REFERENCES users(id),
  job_type job_type NOT NULL DEFAULT 'reroof',
  material text,
  material_color text,
  squares decimal,
  layers integer,
  felt_type text,
  ridge_type text,
  ventilation text,
  gutters_length decimal,
  gutter_size text,
  gutter_color text,
  downspout_color text,
  roof_amount decimal DEFAULT 0,
  gutters_amount decimal DEFAULT 0,
  options_amount decimal DEFAULT 0,
  total_amount decimal DEFAULT 0,
  warranty_manufacturer_years integer,
  warranty_workmanship_years integer,
  estimate_specs jsonb DEFAULT '{}',
  notes text,
  site_notes text,
  permit_number text,
  calendar_event_id text,
  companycam_project_id text,
  estimate_pdf_url text,
  assigned_crew_id uuid REFERENCES users(id),
  scheduled_date date,
  completed_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Job number sequence
CREATE TABLE job_number_sequence (
  year_prefix text PRIMARY KEY,
  last_number integer DEFAULT 0
);

INSERT INTO job_number_sequence (year_prefix, last_number) VALUES ('26-', 0);

CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS text AS $$
DECLARE
  prefix text;
  next_num integer;
BEGIN
  prefix := to_char(now(), 'YY') || '-';
  UPDATE job_number_sequence
    SET last_number = last_number + 1
    WHERE year_prefix = prefix
    RETURNING last_number INTO next_num;
  IF next_num IS NULL THEN
    INSERT INTO job_number_sequence (year_prefix, last_number) VALUES (prefix, 1);
    next_num := 1;
  END IF;
  RETURN prefix || lpad(next_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Activity log
CREATE TABLE activity_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_rep ON jobs(rep_id);
CREATE INDEX idx_jobs_crew ON jobs(assigned_crew_id);
CREATE INDEX idx_jobs_company ON jobs(company_id);
CREATE INDEX idx_activity_job ON activity_log(job_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Companies: all can read
CREATE POLICY "companies_read" ON companies FOR SELECT USING (true);
CREATE POLICY "companies_write" ON companies FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

-- Users: all can read, manager can write
CREATE POLICY "users_read" ON users FOR SELECT USING (true);
CREATE POLICY "users_write" ON users FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);

-- Jobs: role-based
CREATE POLICY "jobs_manager_all" ON jobs FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);
CREATE POLICY "jobs_sales_read" ON jobs FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('sales', 'sales_crew'))
  AND rep_id = auth.uid()
);
CREATE POLICY "jobs_sales_write" ON jobs FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('sales', 'sales_crew'))
  AND rep_id = auth.uid()
);
CREATE POLICY "jobs_crew_read" ON jobs FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('crew', 'sales_crew'))
  AND assigned_crew_id = auth.uid()
);
CREATE POLICY "jobs_crew_update" ON jobs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('crew', 'sales_crew'))
  AND assigned_crew_id = auth.uid()
);

-- Activity log: insert only for all, read own jobs
CREATE POLICY "activity_insert" ON activity_log FOR INSERT WITH CHECK (true);
CREATE POLICY "activity_read" ON activity_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
  OR job_id IN (SELECT id FROM jobs WHERE rep_id = auth.uid() OR assigned_crew_id = auth.uid())
);

-- Storage bucket for estimate PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('estimates', 'estimates', true);

CREATE POLICY "estimates_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'estimates' AND auth.role() = 'authenticated');

CREATE POLICY "estimates_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'estimates');
