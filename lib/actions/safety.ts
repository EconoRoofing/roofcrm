'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, requireManager } from '@/lib/auth-helpers'
import { ROOFING_CHECKLIST_ITEMS } from '@/lib/safety-constants'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolboxTalk {
  id: string
  title: string
  topic: string
  content: string
  duration_minutes: number
  is_template: boolean
  company_id: string | null
  created_by: string | null
  created_at: string
}

export interface ToolboxTalkSession {
  id: string
  talk_id: string
  job_id: string | null
  conducted_by: string
  conducted_at: string
  notes: string | null
  photo_url: string | null
  talk?: ToolboxTalk
  signoff_count?: number
}

export interface SafetyInspection {
  id: string
  job_id: string
  inspector_id: string
  inspection_type: string
  status: string
  checklist: ChecklistItem[]
  overall_notes: string | null
  inspected_at: string
  completed_at: string | null
}

export interface ChecklistItem {
  item: string
  category: string
  checked: boolean
  note?: string
  photo_url?: string
}

export interface Incident {
  id: string
  job_id: string | null
  reported_by: string
  incident_type: string
  severity: string
  description: string
  location: string | null
  lat: number | null
  lng: number | null
  photos: string[]
  witnesses: string | null
  corrective_action: string | null
  status: string
  reported_at: string
  resolved_at: string | null
  reporter?: { name: string }
}

export interface Certification {
  id: string
  user_id: string
  name: string
  cert_number: string | null
  issued_date: string | null
  expiry_date: string | null
  document_url: string | null
  status: string
  created_at: string
  user?: { name: string; avatar_url: string | null }
}

// ─── Roofing-specific pre-work checklist ─────────────────────────────────────

// Re-export for consumers that import from here (not exported from 'use server' boundary)
// The actual data lives in @/lib/safety-constants to avoid "use server" export restrictions
const ROOFING_CHECKLIST: ChecklistItem[] = ROOFING_CHECKLIST_ITEMS

// ─── TOOLBOX TALKS ────────────────────────────────────────────────────────────

export async function getToolboxTalks(): Promise<ToolboxTalk[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('toolbox_talks')
    .select('*')
    .eq('company_id', companyId)
    .order('is_template', { ascending: false })
    .order('title')

  if (error) throw new Error(`Failed to fetch toolbox talks: ${error.message}`)
  return (data ?? []) as ToolboxTalk[]
}

export async function startToolboxTalkSession(
  talkId: string,
  jobId: string | null
): Promise<ToolboxTalkSession> {
  const { userId, companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('toolbox_talk_sessions')
    .insert({
      talk_id: talkId,
      job_id: jobId,
      conducted_by: userId,
      conducted_at: new Date().toISOString(),
      company_id: companyId,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to start session: ${error?.message}`)
  return data as ToolboxTalkSession
}

export async function signToolboxTalk(sessionId: string, userId: string): Promise<void> {
  const { userId: currentUserId, companyId, role } = await getUserWithCompany()
  const supabase = await createClient()

  // Authorization: only the user themselves, or owner/office_manager can sign on behalf
  if (userId !== currentUserId && role !== 'owner' && role !== 'office_manager') {
    throw new Error('Only managers can sign on behalf of others')
  }

  // Verify the target user belongs to the same company
  if (userId !== currentUserId) {
    const { data: targetUser } = await supabase
      .from('users')
      .select('primary_company_id')
      .eq('id', userId)
      .single()
    if (!targetUser || targetUser.primary_company_id !== companyId) {
      throw new Error('Target user not found in your company')
    }
  }

  const { error } = await supabase
    .from('toolbox_talk_signoffs')
    .upsert({
      session_id: sessionId,
      user_id: userId,
    }, { onConflict: 'session_id,user_id' })

  if (error) throw new Error(`Failed to sign off: ${error.message}`)
}

export async function getJobToolboxSessions(jobId: string): Promise<ToolboxTalkSession[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('toolbox_talk_sessions')
    .select('*, talk:toolbox_talks(*)')
    .eq('job_id', jobId)
    .eq('company_id', companyId)
    .order('conducted_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch sessions: ${error.message}`)
  return (data ?? []) as ToolboxTalkSession[]
}

export async function getRecentToolboxSessions(limit = 20): Promise<ToolboxTalkSession[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('toolbox_talk_sessions')
    .select('*, talk:toolbox_talks(*)')
    .eq('company_id', companyId)
    .order('conducted_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to fetch sessions: ${error.message}`)
  return (data ?? []) as ToolboxTalkSession[]
}

export async function getToolboxSessionsThisWeek(): Promise<number> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const { count, error } = await supabase
    .from('toolbox_talk_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gte('conducted_at', weekAgo.toISOString())

  if (error) return 0
  return count ?? 0
}

// ─── SAFETY INSPECTIONS ───────────────────────────────────────────────────────

export async function createInspection(
  jobId: string,
  type: string
): Promise<SafetyInspection> {
  const { userId, companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('safety_inspections')
    .insert({
      job_id: jobId,
      inspector_id: userId,
      inspection_type: type,
      status: 'in_progress',
      checklist: ROOFING_CHECKLIST,
      inspected_at: new Date().toISOString(),
      company_id: companyId,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to create inspection: ${error?.message}`)
  return data as SafetyInspection
}

export async function updateInspectionItem(
  inspectionId: string,
  itemIndex: number,
  updates: { checked?: boolean; note?: string; photo_url?: string }
): Promise<void> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Fetch current checklist scoped to company
  const { data, error: fetchError } = await supabase
    .from('safety_inspections')
    .select('checklist')
    .eq('id', inspectionId)
    .eq('company_id', companyId)
    .single()

  if (fetchError || !data) throw new Error('Inspection not found')

  const checklist = data.checklist as ChecklistItem[]
  if (itemIndex < 0 || itemIndex >= checklist.length) throw new Error('Invalid item index')

  checklist[itemIndex] = { ...checklist[itemIndex], ...updates }

  const { error } = await supabase
    .from('safety_inspections')
    .update({ checklist })
    .eq('id', inspectionId)
    .eq('company_id', companyId)

  if (error) throw new Error(`Failed to update item: ${error.message}`)
}

export async function completeInspection(
  inspectionId: string,
  notes: string
): Promise<SafetyInspection> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase
    .from('safety_inspections')
    .select('checklist')
    .eq('id', inspectionId)
    .eq('company_id', companyId)
    .single()

  if (fetchError || !existing) throw new Error('Inspection not found')

  const checklist = existing.checklist as ChecklistItem[]
  const allChecked = checklist.every((item) => item.checked)
  const status = allChecked ? 'passed' : 'failed'

  const { data, error } = await supabase
    .from('safety_inspections')
    .update({
      status,
      overall_notes: notes,
      completed_at: new Date().toISOString(),
    })
    .eq('id', inspectionId)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to complete inspection: ${error?.message}`)
  return data as SafetyInspection
}

export async function getJobInspections(jobId: string): Promise<SafetyInspection[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('safety_inspections')
    .select('*')
    .eq('job_id', jobId)
    .eq('company_id', companyId)
    .order('inspected_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch inspections: ${error.message}`)
  return (data ?? []) as SafetyInspection[]
}

export async function getTodayInspectionForJob(jobId: string): Promise<SafetyInspection | null> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('safety_inspections')
    .select('*')
    .eq('job_id', jobId)
    .eq('company_id', companyId)
    .gte('inspected_at', todayStart.toISOString())
    .order('inspected_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data as SafetyInspection | null
}

export async function getInspectionsThisMonth(): Promise<{ passed: number; failed: number }> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('safety_inspections')
    .select('status')
    .eq('company_id', companyId)
    .gte('inspected_at', monthStart.toISOString())
    .not('status', 'eq', 'in_progress')

  const passed = (data ?? []).filter((r) => r.status === 'passed').length
  const failed = (data ?? []).filter((r) => r.status === 'failed').length
  return { passed, failed }
}

// ─── INCIDENT REPORTING ───────────────────────────────────────────────────────

export async function reportIncident(data: {
  jobId?: string
  incidentType: string
  severity: string
  description: string
  location?: string
  lat?: number
  lng?: number
  photos?: string[]
  witnesses?: string
}): Promise<Incident> {
  const { userId, companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({
      job_id: data.jobId ?? null,
      reported_by: userId,
      incident_type: data.incidentType,
      severity: data.severity,
      description: data.description,
      location: data.location ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      photos: data.photos ?? [],
      witnesses: data.witnesses ?? null,
      status: 'reported',
      reported_at: new Date().toISOString(),
      company_id: companyId,
    })
    .select()
    .single()

  if (error || !incident) throw new Error(`Failed to report incident: ${error?.message}`)
  return incident as Incident
}

export async function getIncidents(filters?: {
  jobId?: string
  status?: string
}): Promise<Incident[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  let query = supabase
    .from('incidents')
    .select('*, reporter:users!reported_by(name)')
    .eq('company_id', companyId)
    .order('reported_at', { ascending: false })

  if (filters?.jobId) query = query.eq('job_id', filters.jobId)
  if (filters?.status) query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch incidents: ${error.message}`)
  return (data ?? []) as Incident[]
}

export async function getOpenIncidentsCount(): Promise<number> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { count } = await supabase
    .from('incidents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', ['reported', 'investigating'])

  return count ?? 0
}

export async function updateIncidentStatus(
  id: string,
  status: string,
  correctiveAction?: string
): Promise<void> {
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)
  const supabase = await createClient()

  const updates: Record<string, unknown> = { status }
  if (correctiveAction) updates.corrective_action = correctiveAction
  if (status === 'resolved' || status === 'closed') {
    updates.resolved_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('incidents')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
  if (error) throw new Error(`Failed to update incident: ${error.message}`)
}

// ─── CERTIFICATIONS ───────────────────────────────────────────────────────────

export async function addCertification(data: {
  userId: string
  name: string
  certNumber?: string
  issuedDate?: string
  expiryDate?: string
  documentUrl?: string
}): Promise<Certification> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Verify target user belongs to same company
  const { data: targetUser } = await supabase
    .from('users')
    .select('primary_company_id')
    .eq('id', data.userId)
    .single()
  if (!targetUser || targetUser.primary_company_id !== companyId) {
    throw new Error('Target user not found in your company')
  }

  // Determine status
  let status = 'active'
  if (data.expiryDate) {
    const expiry = new Date(data.expiryDate)
    const now = new Date()
    const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntilExpiry < 0) status = 'expired'
    else if (daysUntilExpiry <= 30) status = 'expiring_soon'
  }

  const { data: cert, error } = await supabase
    .from('certifications')
    .insert({
      user_id: data.userId,
      name: data.name,
      cert_number: data.certNumber ?? null,
      issued_date: data.issuedDate ?? null,
      expiry_date: data.expiryDate ?? null,
      document_url: data.documentUrl ?? null,
      status,
      company_id: companyId,
    })
    .select()
    .single()

  if (error || !cert) throw new Error(`Failed to add certification: ${error?.message}`)
  return cert as Certification
}

export async function getUserCertifications(userId: string): Promise<Certification[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('certifications')
    .select('*')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .order('expiry_date', { ascending: true, nullsFirst: false })

  if (error) throw new Error(`Failed to fetch certifications: ${error.message}`)
  return (data ?? []) as Certification[]
}

export async function getExpiringCertifications(): Promise<Certification[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()
  const in30Days = new Date()
  in30Days.setDate(in30Days.getDate() + 30)

  const { data, error } = await supabase
    .from('certifications')
    .select('*, user:users(name, avatar_url)')
    .eq('company_id', companyId)
    .lte('expiry_date', in30Days.toISOString().split('T')[0])
    .neq('status', 'expired')
    .order('expiry_date', { ascending: true })

  if (error) throw new Error(`Failed to fetch expiring certs: ${error.message}`)
  return (data ?? []) as Certification[]
}

export async function getExpiringCertificationsCount(): Promise<number> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()
  const in30Days = new Date()
  in30Days.setDate(in30Days.getDate() + 30)
  const today = new Date().toISOString().split('T')[0]

  const { count } = await supabase
    .from('certifications')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .lte('expiry_date', in30Days.toISOString().split('T')[0])
    .gte('expiry_date', today)

  return count ?? 0
}

export async function getAllCertificationsWithUsers(): Promise<Certification[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('certifications')
    .select('*, user:users(name, avatar_url)')
    .eq('company_id', companyId)
    .order('user_id')
    .order('expiry_date', { ascending: true, nullsFirst: false })

  if (error) throw new Error(`Failed to fetch certifications: ${error.message}`)
  return (data ?? []) as Certification[]
}

export async function checkRequiredCerts(userId: string): Promise<{ valid: boolean; missing: string[] }> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: certs } = await supabase
    .from('certifications')
    .select('name, expiry_date, status')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .eq('status', 'active')

  const validCerts = (certs ?? []).filter(cert => {
    // Cert is valid if: no expiry date set, OR expiry date is in the future
    if (!cert.expiry_date) return true
    return cert.expiry_date >= today
  })

  const validCertNames = validCerts.map(c => c.name.toLowerCase())

  // Need at least one of OSHA 10 or OSHA 30 (not both)
  const hasOsha = validCertNames.some(name =>
    name.includes('osha 10') || name.includes('osha 30')
  )

  const missing: string[] = []
  if (!hasOsha) missing.push('OSHA 10 or OSHA 30')

  return { valid: missing.length === 0, missing }
}

export async function deleteCertification(id: string): Promise<void> {
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)
  const supabase = await createClient()

  const { error } = await supabase
    .from('certifications')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)
  if (error) throw new Error(`Failed to delete certification: ${error.message}`)
}

// ─── MISSING TOOLBOX TALK DETECTION ──────────────────────────────────────────

export async function getCrewsMissingTalkToday(): Promise<Array<{ userId: string; userName: string }>> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Get all active crew users in this company
  const { data: crewMembers } = await supabase
    .from('users')
    .select('id, name')
    .eq('primary_company_id', companyId)
    .eq('role', 'crew')
    .eq('is_active', true)

  if (!crewMembers || crewMembers.length === 0) return []

  // Get all users who signed a talk today
  const { data: todaySignoffs } = await supabase
    .from('toolbox_talk_signoffs')
    .select('user_id')
    .gte('signed_at', today.toISOString())

  const signedUserIds = new Set((todaySignoffs ?? []).map((s) => s.user_id))

  return crewMembers
    .filter((m) => !signedUserIds.has(m.id))
    .map((m) => ({ userId: m.id, userName: m.name }))
}

// ─── SAFETY DASHBOARD STATS ───────────────────────────────────────────────────

// Internal helpers that accept (supabase, companyId) to avoid redundant auth calls

async function _talksThisWeek(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string): Promise<number> {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const { count, error } = await supabase
    .from('toolbox_talk_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gte('conducted_at', weekAgo.toISOString())

  if (error) return 0
  return count ?? 0
}

async function _inspectionsThisMonth(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string): Promise<{ passed: number; failed: number }> {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('safety_inspections')
    .select('status')
    .eq('company_id', companyId)
    .gte('inspected_at', monthStart.toISOString())
    .not('status', 'eq', 'in_progress')

  const passed = (data ?? []).filter((r) => r.status === 'passed').length
  const failed = (data ?? []).filter((r) => r.status === 'failed').length
  return { passed, failed }
}

async function _openIncidentsCount(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string): Promise<number> {
  const { count } = await supabase
    .from('incidents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', ['reported', 'investigating'])

  return count ?? 0
}

async function _expiringCertsCount(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string): Promise<number> {
  const in30Days = new Date()
  in30Days.setDate(in30Days.getDate() + 30)
  const today = new Date().toISOString().split('T')[0]

  const { count } = await supabase
    .from('certifications')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .lte('expiry_date', in30Days.toISOString().split('T')[0])
    .gte('expiry_date', today)

  return count ?? 0
}

export async function getSafetyStats(): Promise<{
  talksThisWeek: number
  inspectionsThisMonth: { passed: number; failed: number }
  openIncidents: number
  expiringCerts: number
}> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const [talksThisWeek, inspectionsThisMonth, openIncidents, expiringCerts] = await Promise.all([
    _talksThisWeek(supabase, companyId),
    _inspectionsThisMonth(supabase, companyId),
    _openIncidentsCount(supabase, companyId),
    _expiringCertsCount(supabase, companyId),
  ])

  return { talksThisWeek, inspectionsThisMonth, openIncidents, expiringCerts }
}
