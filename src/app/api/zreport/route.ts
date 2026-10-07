import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'

// GET /api/zreport?date=YYYY-MM-DD
// Returns end-of-day cashier summary: sales, payments, expenses, cash reconciliation
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('reports.view')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const dateStr = url.searchParams.get('date')
  const targetDate = dateStr ? new Date(dateStr) : new Date()
  const start = new Date(targetDate); start.setHours(0, 0, 0, 0)
  const end = new Date(targetDate); end.setHours(23, 59, 59, 999)

  const settings = await getSettings()

  // Sales for the day
  const sales = await db.sale.findMany({
    where: { createdAt: { gte: start, lte: end } },
    include: { items: true, payments: true, customer: true, user: { select: { name: true } } },
  })
  const totalSales = sales.reduce((s, x) => s + x.total, 0)
  const totalDiscount = sales.reduce((s, x) => s + x.discount, 0)
  const totalTax = sales.reduce((s, x) => s + x.tax, 0)
  const totalPaid = sales.reduce((s, x) => s + x.paidAmount, 0)
  const totalCredit = sales.reduce((s, x) => s + x.remainingAmount, 0)
  const cashSales = sales.filter(s => s.paymentStatus === 'PAID').length
  const creditSales = sales.filter(s => s.paymentStatus === 'CREDIT').length
  const partialSales = sales.filter(s => s.paymentStatus === 'PARTIAL').length

  // Profit calculation
  let totalProfit = 0
  for (const sale of sales) {
    for (const it of sale.items) {
      const batch = it.batchId ? await db.medicineBatch.findUnique({ where: { id: it.batchId } }) : null
      const cost = batch?.purchasePrice ?? 0
      totalProfit += (it.unitPrice * it.quantity / it.unitFactor) - cost * it.quantity
    }
  }

  // Payment methods breakdown
  const paymentBreakdown: Record<string, number> = {}
  for (const sale of sales) {
    for (const p of sale.payments) {
      paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + p.amount
    }
  }

  // Sales returns for the day
  const returns = await db.salesReturn.findMany({
    where: { createdAt: { gte: start, lte: end } },
    include: { items: true },
  })
  const totalReturns = returns.reduce((s, r) => s + r.total, 0)

  // Customer payments collected today
  const customerPayments = await db.customerPayment.findMany({
    where: { createdAt: { gte: start, lte: end } },
  })
  const totalCustomerPayments = customerPayments.reduce((s, p) => s + p.amount, 0)
  const customerPaymentsByMethod: Record<string, number> = {}
  for (const p of customerPayments) {
    customerPaymentsByMethod[p.method] = (customerPaymentsByMethod[p.method] || 0) + p.amount
  }

  // Expenses today
  const expenses = await db.expense.findMany({
    where: { date: { gte: start, lte: end } },
    include: { user: { select: { name: true } } },
  })
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const expensesByCategory: Record<string, number> = {}
  for (const e of expenses) {
    expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + e.amount
  }

  // Supplier payments today
  const supplierPayments = await db.supplierPayment.findMany({
    where: { createdAt: { gte: start, lte: end } },
  })
  const totalSupplierPayments = supplierPayments.reduce((s, p) => s + p.amount, 0)

  // Purchases today
  const purchases = await db.purchase.findMany({
    where: { invoiceDate: { gte: start, lte: end } },
  })
  const totalPurchases = purchases.reduce((s, p) => s + p.total, 0)

  // Cash reconciliation
  // Cash in = cash sales payments + cash customer payments
  // Cash out = cash expenses + cash supplier payments
  const cashIn = (paymentBreakdown['CASH'] || 0) + (customerPaymentsByMethod['CASH'] || 0)
  const cashOut = (expensesByCategory['CASH'] || 0) + (supplierPayments.filter(p => p.method === 'CASH').reduce((s, p) => s + p.amount, 0))
  const netCashFlow = cashIn - cashOut

  // Top-selling items today
  const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {}
  for (const sale of sales) {
    for (const it of sale.items) {
      const med = await db.medicine.findUnique({ where: { id: it.medicineId }, select: { name: true } })
      const name = med?.name ?? 'Unknown'
      if (!itemMap[it.medicineId]) itemMap[it.medicineId] = { name, qty: 0, revenue: 0 }
      itemMap[it.medicineId].qty += it.quantity
      itemMap[it.medicineId].revenue += it.total
    }
  }
  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  return NextResponse.json({
    date: start.toISOString().slice(0, 10),
    pharmacy: {
      name: settings['pharmacy.name'] || 'Pharmacy',
      address: settings['pharmacy.address'] || '',
      phone: settings['pharmacy.phone'] || '',
      currency: settings['pharmacy.currency'] || 'PKR',
    },
    cashier: user.name,
    summary: {
      totalSales: Math.round(totalSales),
      totalDiscount: Math.round(totalDiscount),
      totalTax: Math.round(totalTax),
      totalPaid: Math.round(totalPaid),
      totalCredit: Math.round(totalCredit),
      totalReturns: Math.round(totalReturns),
      totalProfit: Math.round(totalProfit),
      totalExpenses: Math.round(totalExpenses),
      totalCustomerPayments: Math.round(totalCustomerPayments),
      totalSupplierPayments: Math.round(totalSupplierPayments),
      totalPurchases: Math.round(totalPurchases),
      invoiceCount: sales.length,
      cashSalesCount: cashSales,
      creditSalesCount: creditSales,
      partialSalesCount: partialSales,
      returnsCount: returns.length,
    },
    paymentBreakdown: Object.fromEntries(Object.entries(paymentBreakdown).map(([k, v]) => [k, Math.round(v)])),
    customerPaymentsByMethod: Object.fromEntries(Object.entries(customerPaymentsByMethod).map(([k, v]) => [k, Math.round(v)])),
    expensesByCategory: Object.fromEntries(Object.entries(expensesByCategory).map(([k, v]) => [k, Math.round(v)])),
    cashReconciliation: {
      cashIn: Math.round(cashIn),
      cashOut: Math.round(cashOut),
      netCashFlow: Math.round(netCashFlow),
    },
    topItems,
    expenses: expenses.map(e => ({ category: e.category, amount: e.amount, description: e.description, user: e.user?.name })),
    sales: sales.map(s => ({
      invoiceNumber: s.invoiceNumber,
      customer: s.customer?.name || 'Walk-in',
      total: s.total,
      paid: s.paidAmount,
      status: s.paymentStatus,
      time: s.createdAt,
      cashier: s.user?.name,
    })),
  })
}
