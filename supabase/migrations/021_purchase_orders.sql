-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id) NOT NULL,
  supplier_name text NOT NULL,
  supplier_email text,
  order_text text NOT NULL,
  status text DEFAULT 'draft', -- draft, sent, confirmed, delivered
  total_estimated_cost decimal DEFAULT 0,
  sent_at timestamptz,
  confirmed_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_read" ON purchase_orders FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "po_write" ON purchase_orders FOR ALL USING (auth.uid() IS NOT NULL);

-- Supplier Contacts
CREATE TABLE IF NOT EXISTS supplier_contacts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  specialty text, -- shingles, gutters, general, lumber
  is_preferred boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE supplier_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sc_read" ON supplier_contacts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sc_write" ON supplier_contacts FOR ALL USING (auth.uid() IS NOT NULL);

-- Add claim_documents JSONB column to jobs if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'claim_documents'
  ) THEN
    ALTER TABLE jobs ADD COLUMN claim_documents jsonb DEFAULT '[]';
  END IF;
END $$;
