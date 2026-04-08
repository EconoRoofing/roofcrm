'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany } from '@/lib/auth-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EquipmentLocation {
  id: string
  name: string
  type: string
  status: string
  lastLocation: { lat: number; lng: number; updatedAt: string } | null
  assignedTo: string | null
}

export interface LocationHistoryEntry {
  lat: number
  lng: number
  timestamp: string
  userId: string
  userName: string | null
}

// ---------------------------------------------------------------------------
// Public server actions
// ---------------------------------------------------------------------------

/** Update the last known GPS location for a piece of equipment. */
export async function updateEquipmentLocation(
  equipmentId: string,
  lat: number,
  lng: number,
) {
  const { userId, companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Verify equipment belongs to company
  const { data: eq, error: eqErr } = await supabase
    .from('equipment')
    .select('id')
    .eq('id', equipmentId)
    .eq('company_id', companyId)
    .single()

  if (eqErr || !eq) throw new Error('Equipment not found or access denied')

  const now = new Date().toISOString()

  const { error } = await supabase
    .from('equipment')
    .update({ last_lat: lat, last_lng: lng, last_location_at: now })
    .eq('id', equipmentId)

  if (error) throw new Error(`Failed to update location: ${error.message}`)

  // Also log this location update
  await logEquipmentLocation(equipmentId, lat, lng, userId)
}

/** Get all equipment for the company with their last known location. */
export async function getEquipmentLocations(): Promise<EquipmentLocation[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('equipment')
    .select(`
      id, name, type, status,
      last_lat, last_lng, last_location_at,
      current_user:users(name)
    `)
    .eq('company_id', companyId)
    .order('name')

  if (error) throw new Error(`Failed to fetch equipment locations: ${error.message}`)

  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    lastLocation:
      row.last_lat != null && row.last_lng != null
        ? { lat: row.last_lat, lng: row.last_lng, updatedAt: row.last_location_at }
        : null,
    assignedTo: row.current_user?.name ?? null,
  }))
}

/** Get location history for a piece of equipment over the last N days. */
export async function getEquipmentLocationHistory(
  equipmentId: string,
  days = 7,
): Promise<LocationHistoryEntry[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Verify equipment belongs to company
  const { data: eq, error: eqErr } = await supabase
    .from('equipment')
    .select('id')
    .eq('id', equipmentId)
    .eq('company_id', companyId)
    .single()

  if (eqErr || !eq) throw new Error('Equipment not found or access denied')

  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('equipment_logs')
    .select('latitude, longitude, created_at, user_id, user:users(name)')
    .eq('equipment_id', equipmentId)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch location history: ${error.message}`)

  return (data ?? []).map((row: any) => ({
    lat: row.latitude,
    lng: row.longitude,
    timestamp: row.created_at,
    userId: row.user_id,
    userName: row.user?.name ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Internal helper (not a server action — called from other server code)
// ---------------------------------------------------------------------------

/** Insert a GPS log entry for a piece of equipment. */
async function logEquipmentLocation(
  equipmentId: string,
  lat: number,
  lng: number,
  userId: string,
) {
  const supabase = await createClient()

  const { error } = await supabase.from('equipment_logs').insert({
    equipment_id: equipmentId,
    user_id: userId,
    action: 'location_update',
    latitude: lat,
    longitude: lng,
  })

  if (error) console.warn('[equipment-tracking] log insert failed:', error.message)
}
