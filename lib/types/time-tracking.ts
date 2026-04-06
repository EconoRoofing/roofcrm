export type PayType = 'hourly' | 'day_rate'
export type BreakType = 'meal' | 'rest'

export interface TimeEntry {
  id: string
  user_id: string
  job_id: string
  clock_in: string
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_in_distance_ft: number | null
  clock_in_photo_url: string | null
  clock_out: string | null
  clock_out_lat: number | null
  clock_out_lng: number | null
  clock_out_photo_url: string | null
  pay_type: PayType
  hourly_rate: number
  day_rate: number
  regular_hours: number
  overtime_hours: number
  doubletime_hours: number
  total_hours: number
  total_cost: number
  weather_conditions: string | null
  notes: string | null
  flagged: boolean
  flag_reason: string | null
  created_at: string
}

export interface Break {
  id: string
  time_entry_id: string
  type: BreakType
  start_time: string
  end_time: string | null
  duration_minutes: number
  created_at: string
}

export interface GeofenceResult {
  within: boolean
  distanceFt: number
  status: 'confirmed' | 'warning' | 'flagged'
}

export interface OvertimeBreakdown {
  regularHours: number
  overtimeHours: number
  doubletimeHours: number
  totalCost: number
}
