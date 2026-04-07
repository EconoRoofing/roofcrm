-- Drop overly permissive policies
DROP POLICY IF EXISTS "safety_write" ON toolbox_talks;
DROP POLICY IF EXISTS "sessions_write" ON toolbox_talk_sessions;
DROP POLICY IF EXISTS "signoffs_write" ON toolbox_talk_signoffs;
DROP POLICY IF EXISTS "inspections_write" ON safety_inspections;
DROP POLICY IF EXISTS "incidents_write" ON incidents;
DROP POLICY IF EXISTS "certs_write" ON certifications;

-- Toolbox talks: anyone can read, only authenticated users can create templates
CREATE POLICY "talks_write" ON toolbox_talks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "talks_update" ON toolbox_talks FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Sessions: any authenticated user can create (crew leads run talks)
CREATE POLICY "sessions_write" ON toolbox_talk_sessions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Signoffs: users can only sign for themselves
CREATE POLICY "signoffs_write" ON toolbox_talk_signoffs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Inspections: only the inspector can create/update their own
CREATE POLICY "inspections_insert" ON safety_inspections FOR INSERT WITH CHECK (inspector_id = auth.uid());
CREATE POLICY "inspections_update" ON safety_inspections FOR UPDATE USING (inspector_id = auth.uid());

-- Incidents: anyone can report, only reporter or manager can update
CREATE POLICY "incidents_insert" ON incidents FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "incidents_update" ON incidents FOR UPDATE USING (reported_by = auth.uid());

-- Certs: only authenticated users can add/edit certs (via the app's action layer)
CREATE POLICY "certs_insert" ON certifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "certs_update" ON certifications FOR UPDATE USING (auth.uid() IS NOT NULL);
