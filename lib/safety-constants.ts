// Safety constants — kept in a regular (non-server) module to avoid
// 'use server' export restrictions on non-function values.

export interface ChecklistItem {
  item: string
  category: string
  checked: boolean
  note?: string
  photo_url?: string
}

export const ROOFING_CHECKLIST_ITEMS: ChecklistItem[] = [
  { item: 'Fall protection anchors installed and inspected', category: 'fall_protection', checked: false },
  { item: 'All harnesses inspected — no fraying, cuts, or damage to D-rings', category: 'fall_protection', checked: false },
  { item: 'Lanyards and connectors in good condition', category: 'fall_protection', checked: false },
  { item: 'Ladder properly set up (4:1 ratio, 3ft extension above roof edge)', category: 'access', checked: false },
  { item: 'Roof surface checked for wet/icy/slippery conditions', category: 'surface', checked: false },
  { item: 'Power lines identified and clearance verified (10ft minimum)', category: 'electrical', checked: false },
  { item: 'Dumpster placed safely — no overhead hazards below', category: 'site', checked: false },
  { item: 'All crew wearing required PPE', category: 'ppe', checked: false },
  { item: 'Tools and materials secured against falling off roof', category: 'housekeeping', checked: false },
  { item: 'First aid kit accessible on site', category: 'emergency', checked: false },
  { item: 'Emergency plan reviewed with crew', category: 'emergency', checked: false },
  { item: 'Weather conditions safe for roof work', category: 'environment', checked: false },
]
