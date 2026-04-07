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
  hip_length_ft?: number  // if available from measurements
  waste_factor?: number  // default 0.10 (10%)
  pitch?: string  // e.g., "4/12", "6/12", "8/12", "12/12"
}

/**
 * Calculate the pitch multiplier using the Pythagorean theorem.
 * A 4/12 pitch means 4 inches of rise per 12 inches of run.
 * Actual rafter length = sqrt(rise² + 12²) / 12
 */
function getPitchMultiplier(pitch?: string): number {
  if (!pitch) return 1.0
  const match = pitch.match(/(\d+)\/12/)
  if (!match) return 1.0
  const rise = parseInt(match[1])
  return Math.sqrt(rise * rise + 144) / 12
}

export function calculateMaterials(input: MaterialCalcInput): MaterialItem[] {
  const waste = 1 + (input.waste_factor ?? 0.10)
  const pitchMult = getPitchMultiplier(input.pitch)
  const items: MaterialItem[] = []

  // Shingle bundles: squares × pitch multiplier × 3 bundles/sq × waste
  if (input.squares > 0) {
    const adjustedSquares = input.squares * pitchMult
    items.push({
      name: `Shingle Bundles (${input.material || 'Standard'})`,
      quantity: Math.ceil(adjustedSquares * 3 * waste),
      unit: 'bundles',
      formula: `${input.squares} sq × ${pitchMult.toFixed(2)} pitch × 3 bundles × ${waste.toFixed(2)} waste`,
    })
  }

  // Felt/underlayment — also pitch-adjusted
  if (input.squares > 0 && input.felt_type) {
    const rollsPerSq = input.felt_type === '30lb' ? 0.25 : 0.10  // 30lb covers 4sq, synthetic covers 10sq
    const adjustedSquares = input.squares * pitchMult
    items.push({
      name: `${input.felt_type} Underlayment`,
      quantity: Math.ceil(adjustedSquares * rollsPerSq * waste),
      unit: 'rolls',
      formula: `${input.squares} sq × ${pitchMult.toFixed(2)} pitch × ${rollsPerSq} rolls/sq × ${waste.toFixed(2)} waste`,
    })
  }

  // Ice & water shield (valleys) — pitch-adjusted
  if (input.valley_length_ft && input.valley_length_ft > 0) {
    const adjustedValleyFt = input.valley_length_ft * pitchMult
    items.push({
      name: 'Ice & Water Shield',
      quantity: Math.ceil(adjustedValleyFt / 60),  // 60 lf per roll
      unit: 'rolls',
      formula: `${input.valley_length_ft} lf × ${pitchMult.toFixed(2)} pitch / 60 lf/roll`,
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

  // Starter strip (eaves) — pitch-adjusted
  if (input.eave_length_ft && input.eave_length_ft > 0) {
    const adjustedEaveFt = input.eave_length_ft * pitchMult
    items.push({
      name: 'Starter Strip',
      quantity: Math.ceil(adjustedEaveFt / 100 * waste),
      unit: 'bundles',
      formula: `${input.eave_length_ft} lf × ${pitchMult.toFixed(2)} pitch / 100 lf/bundle × ${waste.toFixed(2)} waste`,
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

  // Pipe boots / roof jacks (estimate 1 per 500 sq ft of roof)
  if (input.squares > 0) {
    items.push({
      name: 'Pipe Boots / Roof Jacks',
      quantity: Math.max(2, Math.ceil(input.squares / 5)),  // at least 2, ~1 per 5 sq
      unit: 'ea',
      formula: `~1 per 5 squares (min 2)`,
    })
  }

  // Step flashing (where roof meets walls, estimate 20% of eave length)
  if (input.eave_length_ft && input.eave_length_ft > 0) {
    const stepFlashingFt = Math.ceil(input.eave_length_ft * 0.2)
    if (stepFlashingFt > 0) {
      items.push({
        name: 'Step Flashing',
        quantity: Math.ceil(stepFlashingFt / 1),  // sold individually
        unit: 'pieces',
        formula: `~20% of eave length (${stepFlashingFt} ft)`,
      })
    }
  }

  // Caulk / Roofing Sealant (1 tube per 10 squares)
  if (input.squares > 0) {
    items.push({
      name: 'Roofing Sealant / Caulk',
      quantity: Math.max(2, Math.ceil(input.squares / 10)),
      unit: 'tubes',
      formula: `~1 tube per 10 squares (min 2)`,
    })
  }

  // Plywood / OSB for decking repairs (estimate 5% of squares)
  if (input.squares > 0) {
    const deckingSheets = Math.ceil(input.squares * 0.05 * 3)  // 3 sheets per square for 5% repair
    if (deckingSheets > 0) {
      items.push({
        name: 'Plywood/OSB Decking (4x8 sheets, 5% repair est.)',
        quantity: deckingSheets,
        unit: 'sheets',
        formula: `${input.squares} sq × 5% repair × 3 sheets/sq`,
      })
    }
  }

  // Hip & ridge shingles (separate from ridge cap if valleys/hips exist)
  if (input.ridge_length_ft && input.ridge_length_ft > 0) {
    // Hip shingles: if the job has valleys, it likely has hips too
    if (input.valley_length_ft && input.valley_length_ft > 0) {
      const hipLength = Math.ceil(input.valley_length_ft * 1.2)  // rough estimate
      items.push({
        name: 'Hip Shingles',
        quantity: Math.ceil(hipLength / 25),
        unit: 'bundles',
        formula: `~${hipLength} lf hips / 25 lf/bundle`,
      })
    }
  }

  return items
}
