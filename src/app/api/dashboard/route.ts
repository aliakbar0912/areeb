import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettingNumber } from '@/lib/settings'

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) }

export async function GET() {
  const now = new Date()
  const today = startOfDay(now)
  const eod = endOfDay(now)

  // today's sales & profit
  const todaySales = await db.sale.findMany({
    where: { createdAt: { gte: today, lte: eod } },
    include: { items: true, payments: true },
  })
  const todaySalesTotal = todaySales.reduce((s, x) => s + x.total, 0)
  const todayPaid = todaySales.reduce((s, x) => s + x.paidAmount, 0)
  // profit = sum((unitPrice - batch.purchasePrice) * qty_in_base)
  let todayProfit = 0
  for (const sale of todaySales) {
    for (const it of sale.items) {
      const batch = it.batchId ? await db.medicineBatch.findUnique({ where: { id: it.batchId } }) : null
      const cost = batch?.purchasePrice ?? 0
      todayProfit += (it.unitPrice * it.quantity / it.unitFactor) - cost * it.quantity
    }
  }

  const todayPurchases = await db.purchase.findMany({ where: { invoiceDate: { gte: today, lte: eod } } })
  const todayPurchasesTotal = todayPurchases.reduce((s, x) => s + x.total, 0)

  const todayExpenses = await db.expense.findMany({ where: { date: { gte: today, lte: eod } } })
  const todayExpensesTotal = todayExpenses.reduce((s, x) => s + x.amount, 0)

  const todayInvoices = todaySales.length

  // current cash = sum of CASH sale payments - cash supplier payments - cash expenses + (we don't track opening cash for simplicity)
  const cashSalesPayments = await db.salePayment.aggregate({ _sum: { amount: true }, where: { method: 'CASH' } })
  const cashCustomerPayments = await db.customerPayment.aggregate({ _sum: { amount: true }, where: { method: 'CASH' } })
  const cashSupplierPayments = await db.supplierPayment.aggregate({ _sum: { amount: true }, where: { method: 'CASH' } })
  const cashExpenses = await db.expense.aggregate({ _sum: { amount: true } })
  const currentCash = (cashSalesPayments._sum.amount || 0) + (cashCustomerPayments._sum.amount || 0)
    - (cashSupplierPayments._sum.amount || 0) - (cashExpenses._sum.amount || 0)

  // outstanding customer credit
  const allSales = await db.sale.findMany({ select: { total: true, paidAmount: true } })
  const outstandingCredit = allSales.reduce((s, x) => s + (x.total - x.paidAmount), 0)
    - (await db.customerPayment.aggregate({ _sum: { amount: true } }))._sum.amount

  // supplier payable
  const allPurchases = await db.purchase.findMany({ select: { total: true, paidAmount: true } })
  const suppliers = await db.supplier.findMany({ select: { openingBalance: true } })
  const supplierPaid = (await db.supplierPayment.aggregate({ _sum: { amount: true } }))._sum.amount
  const supplierPayable = allPurchases.reduce((s, x) => s + x.total, 0) + suppliers.reduce((s, x) => s + x.openingBalance, 0) - supplierPaid

  // medicines
  const medicines = await db.medicine.findMany({ include: { batches: true } })
  const totalMedicines = medicines.length
  let lowStock = 0
  let nearExpiry = 0
  let expired = 0
  const expiryAlertDays = await getSettingNumber('stock.expiryAlertDays', 90)
  for (const m of medicines) {
    const stock = m.batches.reduce((s, b) => s + b.quantity, 0)
    if (m.isActive && stock <= m.minStock) lowStock++
    for (const b of m.batches) {
      const days = (new Date(b.expiryDate).getTime() - now.getTime()) / 86400000
      if (days < 0 && b.quantity > 0) expired++
      else if (days >= 0 && days <= expiryAlertDays && b.quantity > 0) nearExpiry++
    }
  }

  // charts: sales last 7 days
  const days: { date: string; sales: number; profit: number; expenses: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
    const dayEnd = new Date(d); dayEnd.setHours(23,59,59,999)
    const ss = await db.sale.findMany({ where: { createdAt: { gte: d, lte: dayEnd } }, include: { items: true } })
    const daySales = ss.reduce((s, x) => s + x.total, 0)
    let dayProfit = 0
    for (const s of ss) for (const it of s.items) {
      const batch = it.batchId ? await db.medicineBatch.findUnique({ where: { id: it.batchId } }) : null
      const cost = batch?.purchasePrice ?? 0
      dayProfit += (it.unitPrice * it.quantity / it.unitFactor) - cost * it.quantity
    }
    const ee = await db.expense.aggregate({ _sum: { amount: true }, where: { date: { gte: d, lte: dayEnd } } })
    days.push({
      date: d.toISOString().slice(5, 10),
      sales: Math.round(daySales),
      profit: Math.round(dayProfit),
      expenses: Math.round(ee._sum.amount || 0),
    })
  }

  // top selling medicines (last 30 days)
  const last30 = new Date(); last30.setDate(last30.getDate() - 30)
  const recentSales = await db.saleItem.findMany({
    where: { sale: { createdAt: { gte: last30 } } },
    include: { medicine: true },
  })
  const topMap: Record<string, { name: string; qty: number; total: number }> = {}
  for (const it of recentSales) {
    if (!topMap[it.medicineId]) topMap[it.medicineId] = { name: it.medicine?.name ?? 'Unknown', qty: 0, total: 0 }
    topMap[it.medicineId].qty += it.quantity
    topMap[it.medicineId].total += it.total
  }
  const topSelling = Object.values(topMap).sort((a,b) => b.total - a.total).slice(0, 8)

  // sales by payment method (last 30 days)
  const payments = await db.salePayment.findMany({ where: { sale: { createdAt: { gte: last30 } } } })
  const methodMap: Record<string, number> = {}
  for (const p of payments) methodMap[p.method] = (methodMap[p.method] || 0) + p.amount
  const byMethod = Object.entries(methodMap).map(([name, value]) => ({ name, value: Math.round(value) }))

  // overdue credit
  const customers = await db.customer.findMany({
    include: { sales: { select: { total: true, paidAmount: true } }, payments: { select: { amount: true } } },
  })
  const overdueCredit = customers.filter(c => {
    const t = c.sales.reduce((s, x) => s + x.total, 0)
    const p = c.sales.reduce((s, x) => s + x.paidAmount, 0) + c.payments.reduce((s, x) => s + x.amount, 0)
    return t - p > 0
  }).length

  return NextResponse.json({
    todaySales: todaySalesTotal,
    todayProfit,
    todayPurchases: todayPurchasesTotal,
    todayExpenses: todayExpensesTotal,
    todayInvoices,
    currentCash,
    outstandingCredit,
    supplierPayable,
    totalMedicines,
    lowStockCount: lowStock,
    nearExpiryCount: nearExpiry,
    expiredCount: expired,
    overdueCreditCount: overdueCredit,
    chart: { days, topSelling, byMethod },
    alerts: {
      lowStock: lowStock,
      nearExpiry: nearExpiry,
      expired: expired,
      overdueCredit,
    },
  })
}
