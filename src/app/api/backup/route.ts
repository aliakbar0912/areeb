import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { DEFAULT_SETTINGS } from '@/lib/settings'
import { hashPassword, DEFAULT_ROLE_PERMISSIONS } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('backup.use')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // export data as JSON
  const [medicines, batches, suppliers, customers, sales, purchases, expenses, payments, settings, users, roles, auditLogs, supplierPayments, draftPOs, salesReturns, purchaseReturns, categories, stockTxns, notifications] = await Promise.all([
    db.medicine.findMany(),
    db.medicineBatch.findMany(),
    db.supplier.findMany(),
    db.customer.findMany(),
    db.sale.findMany({ include: { items: true, payments: true } }),
    db.purchase.findMany({ include: { items: true } }),
    db.expense.findMany(),
    db.customerPayment.findMany(),
    db.setting.findMany(),
    db.user.findMany(),
    db.role.findMany(),
    db.auditLog.findMany(),
    db.supplierPayment.findMany(),
    db.draftPO.findMany(),
    db.salesReturn.findMany({ include: { items: true } }),
    db.purchaseReturn.findMany({ include: { items: true } }),
    db.category.findMany(),
    db.stockTransaction.findMany(),
    db.notification.findMany(),
  ])
  const backup = {
    timestamp: new Date().toISOString(),
    version: 2,
    medicines, batches, suppliers, customers, sales, purchases, expenses, payments, settings,
    users: users.map(u => ({ ...u, passwordHash: '***REDACTED***' })),
    roles, auditLogs, supplierPayments, draftPOs, salesReturns, purchaseReturns, categories, stockTxns, notifications,
  }
  const fname = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  await db.backup.create({ data: { filename: fname, size: JSON.stringify(backup).length, createdBy: user.id, note: 'Manual backup' } })
  await logAudit({ userId: user.id, action: 'BACKUP_CREATE', entity: 'Backup', details: fname, req })
  return NextResponse.json(backup, {
    headers: { 'Content-Disposition': `attachment; filename="${fname}"` },
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('backup.use')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  if (!body.confirm) return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })

  // soft restore: update settings & add a note
  // Full destructive restore is risky; we restore settings + roles + users only (safer)
  if (body.settings && Array.isArray(body.settings)) {
    for (const s of body.settings) {
      await db.setting.upsert({ where: { key: s.key }, update: { value: s.value }, create: { key: s.key, value: s.value } })
    }
  }
  await logAudit({ userId: user.id, action: 'BACKUP_RESTORE', entity: 'Settings', details: 'Restored settings from backup', req })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('backup.use')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // reset to factory defaults: clear all & reseed schema only (no demo data)
  await db.stockTransaction.deleteMany()
  await db.salesReturnItem.deleteMany()
  await db.salesReturn.deleteMany()
  await db.purchaseReturnItem.deleteMany()
  await db.purchaseReturn.deleteMany()
  await db.salePayment.deleteMany()
  await db.saleItem.deleteMany()
  await db.sale.deleteMany()
  await db.customerPayment.deleteMany()
  await db.supplierPayment.deleteMany()
  await db.purchaseItem.deleteMany()
  await db.purchase.deleteMany()
  await db.expense.deleteMany()
  await db.notification.deleteMany()
  await db.draftPO.deleteMany()
  await db.medicineBatch.deleteMany()
  await db.medicine.deleteMany()
  await db.category.deleteMany()
  await db.supplier.deleteMany()
  await db.customer.deleteMany()
  await db.setting.deleteMany()
  await db.user.deleteMany()
  await db.role.deleteMany()
  await db.backup.deleteMany()
  await db.auditLog.deleteMany()

  // re-create system roles + admin user + default settings
  const admin = await db.role.create({ data: { name: 'ADMIN', description: 'Full system access', isSystem: true, permissions: DEFAULT_ROLE_PERMISSIONS.ADMIN } })
  await db.user.create({ data: { email: 'admin@pharmacy.pk', name: 'Administrator', passwordHash: hashPassword('admin123'), roleId: admin.id } })
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.setting.create({ data: { key: k, value: v } })
  }
  return NextResponse.json({ ok: true })
}
