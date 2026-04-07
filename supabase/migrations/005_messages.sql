CREATE TABLE messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  from_number text,
  to_number text,
  body text NOT NULL,
  status text DEFAULT 'sent',
  auto_generated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_messages_job ON messages(job_id);
CREATE INDEX idx_messages_date ON messages(created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read messages for jobs they can see
CREATE POLICY "messages_read" ON messages FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
