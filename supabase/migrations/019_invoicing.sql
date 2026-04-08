-- Invoicing table for job invoices and payments
CREATE TABLE invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  type text DEFAULT 'standard' CHECK (type IN ('standard', 'deposit', 'supplement', 'change_order')),
  amount decimal(10, 2) NOT NULL,
  total_amount decimal(10, 2) NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled')),
  due_date date NOT NULL,
  paid_date date,
  paid_amount decimal(10, 2) DEFAULT 0,
  payment_method text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, invoice_number)
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_read" ON invoices FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "invoice_write" ON invoices FOR ALL USING (auth.uid() IS NOT NULL);

-- Add portal token to jobs for customer portal access
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS portal_token text UNIQUE;

-- Indexes for faster queries
CREATE INDEX idx_invoices_job ON invoices(job_id);
CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_jobs_portal_token ON jobs(portal_token);
