-- Job photos table: stores metadata for photos captured via QuickPhoto
-- The actual images live in Supabase Storage; this table indexes them by job, category, and GPS

CREATE TABLE IF NOT EXISTS job_photos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  storage_path text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  latitude double precision,
  longitude double precision,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_job_photos_job ON job_photos(job_id);
CREATE INDEX idx_job_photos_category ON job_photos(job_id, category);

-- RLS: users can see photos for jobs in their company
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job photos in their company" ON job_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM jobs j
      JOIN users u ON u.primary_company_id = j.company_id
      WHERE j.id = job_photos.job_id
      AND u.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert job photos" ON job_photos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs j
      JOIN users u ON u.primary_company_id = j.company_id
      WHERE j.id = job_photos.job_id
      AND u.id = auth.uid()
    )
  );
