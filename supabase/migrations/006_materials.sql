CREATE TABLE material_lists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',
  waste_factor decimal DEFAULT 0.10,
  total_estimated_cost decimal DEFAULT 0,
  supplier_name text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_material_lists_job ON material_lists(job_id);

ALTER TABLE material_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_lists_read" ON material_lists FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "material_lists_write" ON material_lists FOR ALL USING (auth.uid() IS NOT NULL);
