CREATE TABLE IF NOT EXISTS pricebook_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  category text NOT NULL DEFAULT 'general',
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'each',
  base_price numeric(12,2) NOT NULL DEFAULT 0,
  cost numeric(12,2),
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_pricebook_company ON pricebook_items(company_id);
