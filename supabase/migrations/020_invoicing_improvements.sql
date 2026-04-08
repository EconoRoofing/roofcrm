-- Invoice line items table (referenced in plan, created here if not exists)
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity decimal(10, 2) NOT NULL DEFAULT 1,
  unit_price decimal(10, 2) NOT NULL,
  total decimal(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_item_read" ON invoice_line_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "line_item_write" ON invoice_line_items FOR ALL USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON invoice_line_items(invoice_id);

-- Add payment_link and pdf_url columns to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_link text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz;

-- Crew availability table for time-off/unavailability tracking
CREATE TABLE IF NOT EXISTS crew_unavailability (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  reason text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE crew_unavailability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crew_unavailability_read" ON crew_unavailability FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "crew_unavailability_write" ON crew_unavailability FOR ALL USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_crew_unavailability_user_date ON crew_unavailability(user_id, date);

-- Add duration_days to jobs for multi-day scheduling
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS schedule_duration_days integer DEFAULT 1;
