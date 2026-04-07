export interface MaterialItem {
  name: string
  quantity: number
  unit: string
  formula: string  // human-readable formula description
}

export interface MaterialCalcInput {
  squares: number
  job_type: string
  material?: string
  felt_type?: string
  layers?: number
  ridge_length_ft?: number
  valley_length_ft?: number
  eave_length_ft?: number
  gutter_length_ft?: number
  ridge_vent_ft?: number
  waste_factor?: number  // default 0.10 (10%)
}

export function calculateMaterials(input: MaterialCalcInput): MaterialItem[] {
  const waste = 1 + (input.waste_factor ?? 0.10)
  const items: MaterialItem[] = []

  // Shingle bundles: squares × 3 bundles/sq × waste
  if (input.squares > 0) {
    items.push({
      name: `Shingle Bundles (${input.material || 'Standard'})`,
      quantity: Math.ceil(input.squares * 3 * waste),
      unit: 'bundles',
      formula: `${input.squares} sq × 3 bundles × ${waste.toFixed(2)} waste`,
    })
  }

  // Felt/underlayment
  if (input.squares > 0 && input.felt_type) {
    const rollsPerSq = input.felt_type === '30lb' ? 0.25 : 0.10  // 30lb covers 4sq, synthetic covers 10sq
    items.push({
      name: `${input.felt_type} Underlayment`,
      quantity: Math.ceil(input.squares * rollsPerSq * waste),
      unit: 'rolls',
      formula: `${input.squares} sq × ${rollsPerSq} rolls/sq × ${waste.toFixed(2)} waste`,
    })
  }

  // Ice & water shield (valleys)
  if (input.valley_length_ft && input.valley_length_ft > 0) {
    items.push({
      name: 'Ice & Water Shield',
      quantity: Math.ceil(input.valley_length_ft / 60),  // 60 lf per roll
      unit: 'rolls',
      formula: `${input.valley_length_ft} lf / 60 lf/roll`,
    })
  }

  // Drip edge (eaves, 10ft pieces)
  if (input.eave_length_ft && input.eave_length_ft > 0) {
    items.push({
      name: 'Drip Edge (10ft)',
      quantity: Math.ceil(input.eave_length_ft / 10),
      unit: 'pieces',
      formula: `${input.eave_length_ft} lf / 10 ft/pc`,
    })
  }

  // Ridge cap bundles (25 lf per bundle)
  if (input.ridge_length_ft && input.ridge_length_ft > 0) {
    items.push({
      name: 'Ridge Cap Bundles',
      quantity: Math.ceil(input.ridge_length_ft / 25),
      unit: 'bundles',
      formula: `${input.ridge_length_ft} lf / 25 lf/bundle`,
    })
  }

  // Ridge vent (4ft pieces)
  if (input.ridge_vent_ft && input.ridge_vent_ft > 0) {
    items.push({
      name: 'Ridge Vent (4ft)',
      quantity: Math.ceil(input.ridge_vent_ft / 4),
      unit: 'pieces',
      formula: `${input.ridge_vent_ft} lf / 4 ft/pc`,
    })
  }

  // Nails (coil, approx 0.5 boxes per square)
  if (input.squares > 0) {
    items.push({
      name: 'Roofing Nails (coil)',
      quantity: Math.ceil(input.squares * 0.5),
      unit: 'boxes',
      formula: `${input.squares} sq × 0.5 boxes/sq`,
    })
  }

  // Starter strip (eaves)
  if (input.eave_length_ft && input.eave_length_ft > 0) {
    items.push({
      name: 'Starter Strip',
      quantity: Math.ceil(input.eave_length_ft / 100 * waste),
      unit: 'bundles',
      formula: `${input.eave_length_ft} lf / 100 lf/bundle × ${waste.toFixed(2)} waste`,
    })
  }

  // Tear-off: dumpster
  if (input.layers && input.layers > 0) {
    const dumpsters = input.squares <= 25 ? 1 : Math.ceil(input.squares / 25)
    items.push({
      name: `Dumpster (${input.layers} layer tear-off)`,
      quantity: dumpsters,
      unit: 'ea',
      formula: `${input.squares} sq / 25 sq/dumpster`,
    })
  }

  // Gutters (20ft sections)
  if (input.gutter_length_ft && input.gutter_length_ft > 0) {
    items.push({
      name: 'Seamless Gutter',
      quantity: Math.ceil(input.gutter_length_ft / 20),
      unit: 'sections (20ft)',
      formula: `${input.gutter_length_ft} lf / 20 ft/section`,
    })
  }

  return items
}
