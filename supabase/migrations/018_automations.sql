-- Automation rules table for CRM automation engine
CREATE TABLE automation_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('status_change', 'job_created', 'estimate_sent', 'payment_received')),
  trigger_value text,
  action_type text NOT NULL CHECK (action_type IN ('send_sms', 'send_email', 'create_follow_up', 'assign_crew')),
  action_config jsonb NOT NULL DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automation_read" ON automation_rules FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "automation_write" ON automation_rules FOR ALL USING (auth.uid() IS NOT NULL);

-- Index for faster trigger queries
CREATE INDEX idx_automation_rules_trigger ON automation_rules(trigger_type, is_active);
CREATE INDEX idx_automation_rules_company ON automation_rules(company_id);
