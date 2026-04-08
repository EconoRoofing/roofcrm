-- Job columns referenced in code but missing from schema
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS adjuster_name text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS adjuster_phone text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS adjuster_email text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS date_of_loss date;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS insurance_payout decimal;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS supplement_amount decimal;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS review_received boolean DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS review_date timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS do_not_text boolean DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS warranty_expiration date;

-- Company columns referenced in code but missing from schema
ALTER TABLE companies ADD COLUMN IF NOT EXISTS calendar_id text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_review_link text;
