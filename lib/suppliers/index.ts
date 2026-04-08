import * as abc from './abc-supply'
import * as srs from './srs-roofhub'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SupplierType = 'abc_supply' | 'srs_roofhub' | 'email_only'

export interface SupplierIntegration {
  type: SupplierType
  name: string
  isConfigured: boolean
  hasLivePricing: boolean
  hasDirectOrdering: boolean
  hasOrderTracking: boolean
}

// ─── Supplier Registry ──────────────────────────────────────────────────────

/** Returns all available supplier integrations with their capability status */
export async function getAvailableSuppliers(): Promise<SupplierIntegration[]> {
  const abcConfigured = abc.isConfigured()
  const srsConfigured = srs.isConfigured()

  return [
    {
      type: 'abc_supply',
      name: 'ABC Supply',
      isConfigured: abcConfigured,
      hasLivePricing: abcConfigured,
      hasDirectOrdering: abcConfigured,
      hasOrderTracking: abcConfigured,
    },
    {
      type: 'srs_roofhub',
      name: 'SRS Distribution (Roof Hub)',
      isConfigured: srsConfigured,
      hasLivePricing: srsConfigured,
      hasDirectOrdering: srsConfigured,
      hasOrderTracking: srsConfigured,
    },
    {
      type: 'email_only',
      name: 'Pacific Supply (Email)',
      isConfigured: true, // always available as fallback
      hasLivePricing: false,
      hasDirectOrdering: false,
      hasOrderTracking: false,
    },
  ]
}

/** Returns a supplier client with normalized method names, or null if not configured */
export function getSupplierClient(type: SupplierType) {
  if (type === 'abc_supply' && abc.isConfigured()) {
    return {
      searchProducts: (query: string, branchId?: string) => abc.searchItems(query, branchId ?? ''),
      getProductPrice: (productId: string, branchId: string) =>
        abc.getItemPrice(productId, branchId, '').then(p => ({ productId: p.itemNumber, price: p.price, uom: p.uom })),
      placeOrder: abc.placeOrder,
      searchBranches: abc.searchBranches,
    }
  }
  if (type === 'srs_roofhub' && srs.isConfigured()) {
    return {
      searchProducts: srs.searchProducts,
      getProductPrice: (productId: string, branchId: string) =>
        srs.getProductPrice(productId, branchId).then(p => ({ productId: p.productId, price: p.price, uom: p.uom })),
      placeOrder: srs.placeOrder,
      searchBranches: srs.getBranches,
    }
  }
  return null
}

// Re-export supplier modules for direct access
export { abc, srs }
