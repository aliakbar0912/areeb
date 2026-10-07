import { db } from '@/lib/db'
import type { NextRequest } from 'next/server'

export async function logAudit(opts: {
  userId?: string
  action: string
  entity?: string
  entityId?: string
  details?: string
  req?: NextRequest
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        action: opts.action,
        entity: opts.entity ?? null,
        entityId: opts.entityId ?? null,
        details: opts.details ?? null,
        ipAddress: opts.req?.headers.get('x-forwarded-for') ?? opts.req?.headers.get('x-real-ip') ?? null,
      },
    })
  } catch (e) {
    console.error('Audit log failed', e)
  }
}

// Generate sequential invoice numbers (with collision detection)
export async function nextInvoiceNumber(prefixKey: 'invoice' | 'purchase' | 'salesReturn' | 'purchaseReturn') {
  const key = `${prefixKey}.nextNumber`
  const prefixKey2 = `${prefixKey}.prefix`
  const prefixRow = await db.setting.findUnique({ where: { key: prefixKey2 } })
  const prefix = prefixRow?.value ?? 'INV'

  // Find the highest existing invoice number with this prefix
  const allSetting = await db.setting.findUnique({ where: { key } })
  let next = parseInt(allSetting?.value ?? '1', 10)
  if (isNaN(next)) next = 1

  // Verify the candidate is unique by checking existing records
  const modelMap: Record<string, any> = {
    invoice: db.sale,
    purchase: db.purchase,
    salesReturn: db.salesReturn,
    purchaseReturn: db.purchaseReturn,
  }
  const model = modelMap[prefixKey]
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = `${prefix}-${String(next).padStart(4, '0')}`
    const exists = await (model as any).findUnique({ where: { invoiceNumber: candidate } }).catch(() => null)
      ?? await (model as any).findUnique({ where: { returnNumber: candidate } }).catch(() => null)
    if (!exists) {
      await db.setting.upsert({
        where: { key },
        update: { value: String(next + 1) },
        create: { key, value: String(next + 1) },
      })
      return candidate
    }
    next++
  }
  // Fallback with timestamp
  const fallback = `${prefix}-${Date.now()}`
  await db.setting.upsert({
    where: { key },
    update: { value: String(next + 1) },
    create: { key, value: String(next + 1) },
  })
  return fallback
}
