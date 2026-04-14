// Enum types matching database enums
export type UserRole = 'owner' | 'office_manager' | 'sales' | 'crew'
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
  calendar_id?: string  // Google Calendar ID for this company's events (optional)
  google_review_link?: string | null
}

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatar_url: string | null
  default_maps_app: string | null
  google_refresh_token: string | null
  pay_type: string | null
  hourly_rate: number | null
  day_rate: number | null
  profile_photo_url: string | null
  primary_company_id: string | null
  commission_rate: number | null
  pin_hash: string | null
  is_active: boolean
  pin_failed_attempts: number
  pin_locked_until: string | null
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
  calendar_deleted: boolean
  companycam_project_id: string | null
  estimate_pdf_url: string | null
  assigned_crew_id: string | null
  scheduled_date: string | null
  completed_date: string | null
  warranty_expiration: string | null
  lat: number | null
  lng: number | null
  commission_rate: number | null
  commission_amount: number | null
  insurance_claim: boolean | null
  insurance_company: string | null
  claim_number: string | null
  lead_source: string | null
  adjuster_name: string | null
  adjuster_phone: string | null
  adjuster_email: string | null
  date_of_loss: string | null
  claim_status: string | null
  deductible: number | null
  insurance_payout: number | null
  supplement_amount: number | null
  review_received?: boolean
  review_date?: string | null
  do_not_text?: boolean
  created_at: string
  updated_at: string
}

export interface MaterialList {
  id: string
  job_id: string
  items: import('@/lib/material-calculator').MaterialItem[]
  waste_factor: number
  total_estimated_cost: number
  supplier_name: string | null
  notes: string | null
  created_at: string
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
      material_lists: {
        Row: MaterialList
        Insert: Omit<MaterialList, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<MaterialList, 'id'>>
      }
    }
    Enums: {
      user_role: UserRole
      job_status: JobStatus
      job_type: JobType
    }
  }
}
