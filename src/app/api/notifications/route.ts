import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const type = url.searchParams.get('type') || 'all'
  const now = new Date()
  const thirtyDays = new Date(now.getTime() + 30 * 86400000)

  const alerts: any[] = []

  // low stock
  if (type === 'all' || type === 'low_stock') {
    const meds = await db.medicine.findMany({
      where: { isActive: true },
      include: { batches: true },
    })
    for (const m of meds) {
      const stock = m.batches.reduce((s, b) => s + b.quantity, 0)
      if (stock <= m.minStock) {
        alerts.push({
          id: `low-${m.id}`,
          type: 'LOW_STOCK',
          severity: stock <= 0 ? 'CRITICAL' : 'WARNING',
          title: stock <= 0 ? 'Out of Stock' : 'Low Stock',
          message: `${m.name}: ${stock} units remaining (min: ${m.minStock})`,
          refId: m.id, refType: 'Medicine',
        })
      }
    }
  }

  // expiry
  if (type === 'all' || type === 'expiry') {
    const batches = await db.medicineBatch.findMany({
      where: { quantity: { gt: 0 } },
      include: { medicine: true },
    })
    for (const b of batches) {
      const exp = new Date(b.expiryDate)
      const days = Math.floor((exp.getTime() - now.getTime()) / 86400000)
      if (days < 0) {
        alerts.push({
          id: `exp-${b.id}`, type: 'EXPIRED', severity: 'CRITICAL',
          title: 'Expired Medicine',
          message: `${b.medicine?.name} batch ${b.batchNumber} expired on ${exp.toISOString().slice(0,10)}`,
          refId: b.id, refType: 'MedicineBatch',
        })
      } else if (days <= 30) {
        alerts.push({
          id: `exp30-${b.id}`, type: 'EXPIRY', severity: 'WARNING',
          title: 'Expiring within 30 days',
          message: `${b.medicine?.name} batch ${b.batchNumber} expires ${exp.toISOString().slice(0,10)}`,
          refId: b.id, refType: 'MedicineBatch',
        })
      } else if (days <= 90) {
        alerts.push({
          id: `exp90-${b.id}`, type: 'EXPIRY', severity: 'INFO',
          title: 'Expiring within 90 days',
          message: `${b.medicine?.name} batch ${b.batchNumber} expires ${exp.toISOString().slice(0,10)}`,
          refId: b.id, refType: 'MedicineBatch',
        })
      }
    }
  }

  // credit due
  if (type === 'all' || type === 'credit') {
    const customers = await db.customer.findMany({
      include: { sales: { select: { total: true, paidAmount: true } }, payments: { select: { amount: true } } },
    })
    for (const c of customers) {
      const t = c.sales.reduce((s, x) => s + x.total, 0)
      const p = c.sales.reduce((s, x) => s + x.paidAmount, 0) + c.payments.reduce((s, x) => s + x.amount, 0)
      const outstanding = t - p
      if (outstanding > 0) {
        alerts.push({
          id: `cred-${c.id}`, type: 'CREDIT_DUE', severity: 'WARNING',
          title: 'Customer Credit Outstanding',
          message: `${c.name} owes PKR ${outstanding.toFixed(0)}`,
          refId: c.id, refType: 'Customer',
        })
      }
    }
  }

  // supplier due
  if (type === 'all' || type === 'supplier') {
    const suppliers = await db.supplier.findMany({
      include: { purchases: { select: { total: true, paidAmount: true } }, payments: { select: { amount: true } } },
    })
    for (const s of suppliers) {
      const t = s.purchases.reduce((sum, x) => sum + x.total, 0) + s.openingBalance
      const p = s.payments.reduce((sum, x) => sum + x.amount, 0)
      const payable = t - p
      if (payable > 0) {
        alerts.push({
          id: `sup-${s.id}`, type: 'SUPPLIER_DUE', severity: 'INFO',
          title: 'Supplier Payable',
          message: `Owe ${s.name} PKR ${payable.toFixed(0)}`,
          refId: s.id, refType: 'Supplier',
        })
      }
    }
  }

  alerts.sort((a, b) => {
    const order: any = { CRITICAL: 0, WARNING: 1, INFO: 2 }
    return order[a.severity] - order[b.severity]
  })

  return NextResponse.json({ alerts })
}
