import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const type = url.searchParams.get('type') || 'daily-sales'

  const whereDate: any = {}
  if (from) whereDate.gte = new Date(from)
  if (to) whereDate.lte = new Date(to + 'T23:59:59.999Z')

  if (type === 'daily-sales' || type === 'daily-profit') {
    // group sales by day
    const sales = await db.sale.findMany({
      where: whereDate.gte || whereDate.lte ? { createdAt: whereDate } : {},
      include: { items: true },
    })
    const map: Record<string, { sales: number; profit: number; count: number }> = {}
    for (const s of sales) {
      const day = s.createdAt.toISOString().slice(0, 10)
      if (!map[day]) map[day] = { sales: 0, profit: 0, count: 0 }
      map[day].sales += s.total
      map[day].count += 1
      for (const it of s.items) {
        const batch = it.batchId ? await db.medicineBatch.findUnique({ where: { id: it.batchId } }) : null
        const cost = batch?.purchasePrice ?? 0
        map[day].profit += (it.unitPrice * it.quantity / it.unitFactor) - cost * it.quantity
      }
    }
    const rows = Object.entries(map).map(([date, v]) => ({
      date, sales: Math.round(v.sales), profit: Math.round(v.profit), count: v.count,
    })).sort((a, b) => a.date.localeCompare(b.date))
    return NextResponse.json({ rows, total: rows.reduce((s, r) => s + r.sales, 0), profitTotal: rows.reduce((s, r) => s + r.profit, 0) })
  }

  if (type === 'profit-medicine') {
    const items = await db.saleItem.findMany({
      where: whereDate.gte || whereDate.lte ? { sale: { createdAt: whereDate } } : {},
      include: { medicine: true, sale: { select: { createdAt: true } } },
    })
    const map: Record<string, { name: string; qty: number; revenue: number; cost: number; profit: number }> = {}
    for (const it of items) {
      const key = it.medicineId
      if (!map[key]) map[key] = { name: it.medicine?.name ?? 'Unknown', qty: 0, revenue: 0, cost: 0, profit: 0 }
      const batch = it.batchId ? await db.medicineBatch.findUnique({ where: { id: it.batchId } }) : null
      const cost = (batch?.purchasePrice ?? 0) * it.quantity
      const rev = it.total
      map[key].qty += it.quantity
      map[key].revenue += rev
      map[key].cost += cost
      map[key].profit += rev - cost
    }
    const rows = Object.values(map).map(v => ({
      name: v.name, qty: v.qty, revenue: Math.round(v.revenue),
      cost: Math.round(v.cost), profit: Math.round(v.profit),
    })).sort((a,b) => b.profit - a.profit)
    return NextResponse.json({ rows })
  }

  if (type === 'profit-category') {
    const items = await db.saleItem.findMany({
      where: whereDate.gte || whereDate.lte ? { sale: { createdAt: whereDate } } : {},
      include: { medicine: { include: { category: true } }, sale: { select: { createdAt: true } } },
    })
    const map: Record<string, { name: string; revenue: number; cost: number; profit: number }> = {}
    for (const it of items) {
      const cat = it.medicine?.category?.name ?? 'Uncategorized'
      if (!map[cat]) map[cat] = { name: cat, revenue: 0, cost: 0, profit: 0 }
      const batch = it.batchId ? await db.medicineBatch.findUnique({ where: { id: it.batchId } }) : null
      const cost = (batch?.purchasePrice ?? 0) * it.quantity
      map[cat].revenue += it.total
      map[cat].cost += cost
      map[cat].profit += it.total - cost
    }
    const rows = Object.values(map).map(v => ({
      name: v.name, revenue: Math.round(v.revenue), cost: Math.round(v.cost), profit: Math.round(v.profit),
    })).sort((a,b) => b.profit - a.profit)
    return NextResponse.json({ rows })
  }

  if (type === 'inventory-summary') {
    const meds = await db.medicine.findMany({ include: { batches: true, category: true } })
    const rows = meds.map(m => {
      const stock = m.batches.reduce((s, b) => s + b.quantity, 0)
      const value = m.batches.reduce((s, b) => s + b.quantity * b.purchasePrice, 0)
      const status = stock <= 0 ? 'OUT_OF_STOCK' : (stock <= m.minStock ? 'LOW_STOCK' : (stock >= m.maxStock ? 'OVERSTOCK' : 'OK'))
      return {
        id: m.id, name: m.name, category: m.category?.name ?? '',
        stock, value: Math.round(value), unitType: m.unitType,
        minStock: m.minStock, maxStock: m.maxStock, status,
        manufacturer: m.manufacturer,
      }
    })
    return NextResponse.json({ rows })
  }

  if (type === 'expiry-summary') {
    const batches = await db.medicineBatch.findMany({
      include: { medicine: true },
      where: { quantity: { gt: 0 } },
    })
    const now = new Date()
    const rows = batches.map(b => {
      const days = Math.floor((new Date(b.expiryDate).getTime() - now.getTime()) / 86400000)
      let status = 'SAFE'
      if (days < 0) status = 'EXPIRED'
      else if (days <= 30) status = 'EXPIRY_30'
      else if (days <= 60) status = 'EXPIRY_60'
      else if (days <= 90) status = 'EXPIRY_90'
      return {
        id: b.id, medicine: b.medicine?.name, batchNumber: b.batchNumber,
        expiry: b.expiryDate.toISOString().slice(0, 10), quantity: b.quantity,
        cost: Math.round(b.quantity * b.purchasePrice), days, status,
      }
    }).sort((a, b) => a.days - b.days)
    return NextResponse.json({ rows })
  }

  if (type === 'purchases-summary') {
    const purchases = await db.purchase.findMany({
      where: whereDate.gte || whereDate.lte ? { invoiceDate: whereDate } : {},
      include: { supplier: true, items: { include: { medicine: true } } },
    })
    const bySupplier: Record<string, { name: string; total: number; paid: number }> = {}
    const byMed: Record<string, { name: string; qty: number; total: number }> = {}
    for (const p of purchases) {
      const key = p.supplier?.name ?? 'Unknown'
      if (!bySupplier[key]) bySupplier[key] = { name: key, total: 0, paid: 0 }
      bySupplier[key].total += p.total
      bySupplier[key].paid += p.paidAmount
      for (const it of p.items) {
        const mk = it.medicine?.name ?? 'Unknown'
        if (!byMed[mk]) byMed[mk] = { name: mk, qty: 0, total: 0 }
        byMed[mk].qty += it.quantity
        byMed[mk].total += it.total
      }
    }
    return NextResponse.json({
      bySupplier: Object.values(bySupplier).sort((a,b) => b.total - a.total),
      byMedicine: Object.values(byMed).sort((a,b) => b.total - a.total),
    })
  }

  if (type === 'customer-summary') {
    const customers = await db.customer.findMany({
      include: { sales: { select: { total: true, paidAmount: true } }, payments: { select: { amount: true } } },
    })
    const rows = customers.map(c => {
      const t = c.sales.reduce((s, x) => s + x.total, 0)
      const p = c.sales.reduce((s, x) => s + x.paidAmount, 0) + c.payments.reduce((s, x) => s + x.amount, 0)
      return { id: c.id, name: c.name, phone: c.phone, total: t, paid: p, outstanding: t - p }
    })
    return NextResponse.json({ rows })
  }

  if (type === 'supplier-summary') {
    const suppliers = await db.supplier.findMany({
      include: { purchases: { select: { total: true, paidAmount: true } }, payments: { select: { amount: true } } },
    })
    const rows = suppliers.map(s => {
      const t = s.purchases.reduce((sum, x) => sum + x.total, 0) + s.openingBalance
      const p = s.payments.reduce((sum, x) => sum + x.amount, 0)
      return { id: s.id, name: s.name, company: s.company, total: t, paid: p, payable: t - p }
    })
    return NextResponse.json({ rows })
  }

  if (type === 'expenses-summary') {
    const expenses = await db.expense.findMany({
      where: whereDate.gte || whereDate.lte ? { date: whereDate } : {},
    })
    const byCat: Record<string, number> = {}
    for (const e of expenses) byCat[e.category] = (byCat[e.category] || 0) + e.amount
    return NextResponse.json({ byCategory: Object.entries(byCat).map(([k, v]) => ({ name: k, amount: v })) })
  }

  return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
}
