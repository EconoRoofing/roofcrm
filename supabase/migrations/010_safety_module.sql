-- ─── Safety Module Migration ─────────────────────────────────────────────────

-- Toolbox Talks
CREATE TABLE toolbox_talks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  topic text NOT NULL,  -- fall_protection, ladder_safety, heat_illness, electrical, ppe, general
  content text NOT NULL,
  duration_minutes integer DEFAULT 10,
  is_template boolean DEFAULT false,
  company_id uuid REFERENCES companies(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE toolbox_talk_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  talk_id uuid REFERENCES toolbox_talks(id) NOT NULL,
  job_id uuid REFERENCES jobs(id),
  conducted_by uuid REFERENCES users(id) NOT NULL,
  conducted_at timestamptz DEFAULT now(),
  notes text,
  photo_url text
);

CREATE TABLE toolbox_talk_signoffs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES toolbox_talk_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  signed_at timestamptz DEFAULT now(),
  UNIQUE(session_id, user_id)
);

-- Safety Inspections
CREATE TABLE safety_inspections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id) NOT NULL,
  inspector_id uuid REFERENCES users(id) NOT NULL,
  inspection_type text NOT NULL,  -- pre_work, daily, weekly, incident_follow_up
  status text DEFAULT 'in_progress',  -- in_progress, passed, failed, needs_action
  checklist jsonb NOT NULL DEFAULT '[]',
  overall_notes text,
  inspected_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Incident Reports
CREATE TABLE incidents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id),
  reported_by uuid REFERENCES users(id) NOT NULL,
  incident_type text NOT NULL,  -- injury, near_miss, property_damage, environmental
  severity text NOT NULL,       -- minor, moderate, serious, fatal
  description text NOT NULL,
  location text,
  lat decimal,
  lng decimal,
  photos jsonb DEFAULT '[]',
  witnesses text,
  corrective_action text,
  status text DEFAULT 'reported',  -- reported, investigating, resolved, closed
  reported_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- Certifications & Licenses
CREATE TABLE certifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) NOT NULL,
  name text NOT NULL,
  cert_number text,
  issued_date date,
  expiry_date date,
  document_url text,
  status text DEFAULT 'active',  -- active, expiring_soon, expired
  created_at timestamptz DEFAULT now()
);

-- PPE verification on time entries
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS ppe_verified jsonb DEFAULT '{}';

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE toolbox_talks ENABLE ROW LEVEL SECURITY;
ALTER TABLE toolbox_talk_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE toolbox_talk_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_read" ON toolbox_talks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "safety_write" ON toolbox_talks FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "sessions_read" ON toolbox_talk_sessions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sessions_write" ON toolbox_talk_sessions FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "signoffs_read" ON toolbox_talk_signoffs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "signoffs_write" ON toolbox_talk_signoffs FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "inspections_read" ON safety_inspections FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "inspections_write" ON safety_inspections FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "incidents_read" ON incidents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "incidents_write" ON incidents FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "certs_read" ON certifications FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "certs_write" ON certifications FOR ALL USING (auth.uid() IS NOT NULL);

-- ─── Seed roofing-specific toolbox talk templates ─────────────────────────────

INSERT INTO toolbox_talks (title, topic, content, is_template, duration_minutes) VALUES
('Fall Protection on Residential Roofs', 'fall_protection',
 'Today we discuss fall protection requirements for residential roofing. OSHA requires fall protection at 6 feet or above in construction. Key points: (1) Always use a personal fall arrest system (harness + lanyard + anchor) when working on steep-slope roofs. (2) Guardrail systems or safety net systems are alternatives on some roof types. (3) Inspect your harness before each use — check for fraying, cuts, or damage to D-rings. (4) Anchor points must support 5,000 lbs per worker. (5) Never tie off to a vent pipe or unsecured structure. (6) Keep your work area clean — loose shingles and tools are trip hazards. Remember: one fall can end your career or your life.',
 true, 10),

('Ladder Safety for Roof Access', 'ladder_safety',
 'Proper ladder use prevents falls when accessing roofs. Key points: (1) Use the 4-to-1 rule — for every 4 feet of height, the base should be 1 foot from the wall. (2) The ladder must extend 3 feet above the roof edge. (3) Always maintain 3 points of contact when climbing. (4) Never carry tools while climbing — use a tool belt or hoist. (5) Set up on firm, level ground — use leg levelers on uneven terrain. (6) Face the ladder when climbing up or down. (7) Inspect ladder rungs and locks before each use. (8) Only one person on a ladder at a time.',
 true, 10),

('Heat Illness Prevention', 'heat_illness',
 'Central Valley heat can be deadly. California requires a Heat Illness Prevention Plan. Key points: (1) Drink water BEFORE you are thirsty — at least 1 quart per hour in extreme heat. (2) Take shade breaks — 10 minutes every 2 hours minimum when over 95°F. (3) Know the signs: headache, dizziness, nausea, confusion, rapid heartbeat. (4) If someone shows signs of heat stroke (confusion, loss of consciousness), call 911 immediately — cool them with water and shade. (5) Acclimatization: new workers need 14 days to adjust to heat — lighter duties in the first week. (6) Wear light-colored, loose-fitting clothing. (7) Never work alone on a hot roof.',
 true, 10),

('Roofing Material Hazards', 'general',
 'Roofing materials present unique hazards. Key points: (1) Hot tar and asphalt can cause severe burns — wear proper PPE including heat-resistant gloves. (2) Tile and slate are heavy — lift with your legs, not your back. Max 50 lbs per person. (3) Shingle dust contains fiberglass — wear an N95 mask when cutting or tearing off. (4) Metal roofing edges are razor sharp — cut-resistant gloves required. (5) Power tools (nail guns, saws) — always check before use, never disable safety mechanisms. (6) Dumpster loading — watch for falling debris, wear hard hats below the roof line.',
 true, 10),

('PPE Requirements for Roofing', 'ppe',
 'Required PPE for all roofing work: (1) Hard hat — required when working below overhead activity or near falling object hazards. (2) Safety glasses — required when cutting, nailing, or grinding. (3) Work boots — steel-toe or composite-toe, slip-resistant soles. (4) Gloves — leather or cut-resistant when handling materials. (5) Fall protection harness — required on all steep-slope roofs and any roof over 6 feet. (6) N95 respirator — required during tear-off and cutting. (7) Hearing protection — required when using power tools for extended periods. (8) High-visibility vest — required when working near traffic or on commercial sites. Inspect all PPE before each shift.',
 true, 10),

('Electrical Safety Around Roofs', 'electrical',
 'Electrical hazards are a leading cause of construction fatalities. Key points: (1) Locate all overhead power lines before starting work — maintain 10-foot clearance. (2) Use non-conductive ladders (fiberglass, not aluminum) near electrical. (3) Metal roofing and flashing conduct electricity — never work in lightning storms. (4) If you contact a power line: do NOT touch the person. Call 911. (5) When installing ridge vents or valleys near service drops, coordinate with the utility company. (6) Portable generators — keep dry, proper grounding, never back-feed into the building.',
 true, 10);
