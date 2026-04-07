CREATE TABLE IF NOT EXISTS equipment (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,  -- truck, trailer, dumpster, lift, tools
  company_id uuid REFERENCES companies(id),
  status text DEFAULT 'available',  -- available, in_use, maintenance
  current_job_id uuid REFERENCES jobs(id),
  current_user_id uuid REFERENCES users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid REFERENCES equipment(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id),
  job_id uuid REFERENCES jobs(id),
  action text NOT NULL,  -- checked_out, returned, maintenance_start, maintenance_end
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "equipment_read" ON equipment FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS "equipment_write" ON equipment FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS "equipment_logs_read" ON equipment_logs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS "equipment_logs_write" ON equipment_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
