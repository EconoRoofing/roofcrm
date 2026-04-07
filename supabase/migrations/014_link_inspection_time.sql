ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS safety_inspection_id uuid REFERENCES safety_inspections(id);
