-- Subcontractor management tables
CREATE TABLE IF NOT EXISTS subcontractors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  specialty text,
  license_number text,
  insurance_expiry date,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_subcontractors_company ON subcontractors(company_id);

CREATE TABLE IF NOT EXISTS job_subcontractors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE CASCADE NOT NULL,
  scope_of_work text,
  agreed_amount numeric(12,2),
  status text DEFAULT 'assigned',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_job_subs_job ON job_subcontractors(job_id);

-- RLS
ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_subcontractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subs_manager_all" ON subcontractors FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);
CREATE POLICY "subs_read" ON subcontractors FOR SELECT USING (
  company_id IN (
    SELECT COALESCE(primary_company_id, company_id)
    FROM users WHERE id = auth.uid()
  )
);

CREATE POLICY "job_subs_manager_all" ON job_subcontractors FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
);
CREATE POLICY "job_subs_read" ON job_subcontractors FOR SELECT USING (
  job_id IN (
    SELECT id FROM jobs
    WHERE rep_id = auth.uid() OR assigned_crew_id = auth.uid()
  )
);
