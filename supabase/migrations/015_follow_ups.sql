CREATE TABLE IF NOT EXISTS follow_ups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  assigned_to uuid REFERENCES users(id) NOT NULL,
  due_date date NOT NULL,
  note text NOT NULL,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_user ON follow_ups(assigned_to);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due ON follow_ups(due_date);

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follow_ups_read" ON follow_ups FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "follow_ups_write" ON follow_ups FOR ALL USING (auth.uid() IS NOT NULL);
