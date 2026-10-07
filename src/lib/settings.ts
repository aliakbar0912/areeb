import { db } from '@/lib/db'

// Cache settings in memory (per-request -> singleton process)
let settingsCache: Record<string, string> | null = null

export async function getSettings(): Promise<Record<string, string>> {
  if (settingsCache !== null) return settingsCache
  const rows = await db.setting.findMany()
  settingsCache = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return settingsCache
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const all = await getSettings()
  return all[key] ?? fallback
}

export async function getSettingNumber(key: string, fallback = 0): Promise<number> {
  const v = await getSetting(key)
  const n = parseFloat(v)
  return isNaN(n) ? fallback : n
}

export async function getSettingBool(key: string, fallback = false): Promise<boolean> {
  const v = await getSetting(key)
  if (!v) return fallback
  return v === 'true' || v === '1'
}

export async function setSetting(key: string, value: string) {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
  settingsCache = null // invalidate
}

export async function setManySettings(entries: Record<string, string>) {
  await Promise.all(Object.entries(entries).map(([k, v]) =>
    db.setting.upsert({
      where: { key: k },
      update: { value: v },
      create: { key: k, value: v },
    })
  ))
  settingsCache = null
}

export const DEFAULT_SETTINGS: Record<string, string> = {
  'pharmacy.name': 'Shifa Medical Store',
  'pharmacy.address': 'Main Boulevard, Gulberg III, Lahore, Pakistan',
  'pharmacy.phone': '+92 300 1234567',
  'pharmacy.email': 'info@shifapharmacy.pk',
  'pharmacy.logo': '',
  'pharmacy.currency': 'PKR',
  'invoice.prefix': 'INV',
  'invoice.nextNumber': '1001',
  'purchase.prefix': 'PUR',
  'purchase.nextNumber': '5001',
  'salesReturn.prefix': 'SR',
  'salesReturn.nextNumber': '100',
  'purchaseReturn.prefix': 'PR',
  'purchaseReturn.nextNumber': '100',
  'invoice.taxEnabled': 'false',
  'invoice.taxRate': '0',
  'invoice.receiptSize': '80mm',
  'invoice.showBarcode': 'true',
  'invoice.footerNote': 'Thank you for your business. Medicines cannot be returned once sold.',
  'stock.lowStockThreshold': '10',
  'stock.expiryAlertDays': '90',
  'stock.expiryShortDays': '30',
  'stock.allowNegative': 'false',
  'stock.fifoEnabled': 'true',
  'backup.autoEnabled': 'false',
  'backup.lastRun': '',
  // Loyalty program
  'loyalty.enabled': 'true',
  'loyalty.rupeesPerPoint': '100', // earn 1 point per Rs 100 spent
  'loyalty.redeemRate': '1', // 1 point = Rs 1 discount
  'loyalty.minRedeemPoints': '50', // minimum 50 points to redeem
}
