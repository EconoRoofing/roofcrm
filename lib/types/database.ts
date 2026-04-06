// Enum types matching database enums
export type UserRole = 'manager' | 'sales' | 'crew' | 'sales_crew'
export type JobStatus =
  | 'lead'
  | 'estimate_scheduled'
  | 'pending'
  | 'sold'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
export type JobType =
  | 'reroof'
  | 'repair'
  | 'maintenance'
  | 'inspection'
  | 'coating'
  | 'new_construction'
  | 'gutters'
  | 'other'

// JSONB shape for estimate_specs column
export interface EstimateSpecs {
  fascia_replacement?: boolean
  fascia_lineal_ft?: number
  fascia_dimensions?: string
  tg_shiplap?: boolean
  sheeting?: boolean
  sheeting_type?: string
  metal_nosing?: boolean
  nosing_color?: string
  ridge_caps?: boolean
  ridge_vent_ft?: number
  ohagen_vents?: number
  antenna_removal?: boolean
  solar_removal?: boolean
  flat_section_sq?: number
  other_structures?: string
}

// Table interfaces
export interface Company {
  id: string
  name: string
  logo_url: string | null
  address: string | null
  phone: string | null
  license_number: string | null
  color: string
}

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatar_url: string | null
  default_maps_app: string | null
  google_refresh_token: string | null
  created_at: string
}

export interface Job {
  id: string
  job_number: string
  company_id: string
  status: JobStatus
  customer_name: string
  address: string
  city: string
  state: string | null
  zip: string | null
  phone: string | null
  contact_name: string | null
  email: string | null
  referred_by: string | null
  rep_id: string | null
  job_type: JobType
  material: string | null
  material_color: string | null
  squares: number | null
  layers: number | null
  felt_type: string | null
  ridge_type: string | null
  ventilation: string | null
  gutters_length: number | null
  gutter_size: string | null
  gutter_color: string | null
  downspout_color: string | null
  roof_amount: number | null
  gutters_amount: number | null
  options_amount: number | null
  total_amount: number | null
  warranty_manufacturer_years: number | null
  warranty_workmanship_years: number | null
  estimate_specs: EstimateSpecs | null
  notes: string | null
  site_notes: string | null
  permit_number: string | null
  calendar_event_id: string | null
  companycam_project_id: string | null
  estimate_pdf_url: string | null
  assigned_crew_id: string | null
  scheduled_date: string | null
  completed_date: string | null
  created_at: string
  updated_at: string
}

export interface ActivityLog {
  id: string
  job_id: string
  user_id: string | null
  action: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

// Supabase typed client Database type
export type Database = {
  public: {
    Tables: {
      companies: {
        Row: Company
        Insert: Omit<Company, 'id'> & { id?: string }
        Update: Partial<Omit<Company, 'id'>>
      }
      users: {
        Row: User
        Insert: Omit<User, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<User, 'id'>>
      }
      jobs: {
        Row: Job
        Insert: Omit<Job, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Job, 'id'>>
      }
      activity_log: {
        Row: ActivityLog
        Insert: Omit<ActivityLog, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<ActivityLog, 'id'>>
      }
    }
    Enums: {
      user_role: UserRole
      job_status: JobStatus
      job_type: JobType
    }
  }
}
