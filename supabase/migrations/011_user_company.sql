-- Users can work for multiple companies but have a primary
-- primary_company_id tells you which company's payroll they belong to
-- Does NOT restrict access to other companies' data
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_company_id uuid REFERENCES companies(id);
