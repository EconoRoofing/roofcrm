-- Drop permissive write policy
DROP POLICY IF EXISTS "equipment_write" ON equipment;

-- Anyone authenticated can read all equipment (needed for checkout)
-- Write operations (add/modify) require authenticated user
CREATE POLICY "equipment_insert" ON equipment FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_update" ON equipment FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_delete" ON equipment FOR DELETE USING (auth.uid() IS NOT NULL);
