-- Multi-round supplement tracking for insurance claims
CREATE TABLE IF NOT EXISTS supplement_rounds (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  round_number int NOT NULL DEFAULT 1,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  denied_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_supplement_rounds_job ON supplement_rounds(job_id);

ALTER TABLE supplement_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplement_rounds_read" ON supplement_rounds FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "supplement_rounds_write" ON supplement_rounds FOR ALL USING (auth.uid() IS NOT NULL);
