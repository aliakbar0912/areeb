import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/customers/[id]/purchase-history
// Returns detailed purchase history with medicine breakdown for a customer
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  // Get all sales for this customer with items
  const sales = await db.sale.findMany({
    where: { customerId: id },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { include: { medicine: { select: { name: true, genericName: true, manufacturer: true } } } },
      payments: true,
      user: { select: { name: true } },
    },
    take: 200,
  })

  // Aggregate medicine breakdown
  const medMap: Record<string, { name: string; genericName?: string | null; manufacturer?: string | null; qty: number; revenue: number; count: number }> = {}
  for (const sale of sales) {
    for (const item of sale.items) {
      const key = item.medicineId
      if (!medMap[key]) {
        medMap[key] = {
          name: item.medicine?.name || 'Unknown',
          genericName: item.medicine?.genericName,
          manufacturer: item.medicine?.manufacturer,
          qty: 0, revenue: 0, count: 0,
        }
      }
      medMap[key].qty += item.quantity
      medMap[key].revenue += item.total
      medMap[key].count += 1
    }
  }

  const medicineBreakdown = Object.values(medMap).sort((a, b) => b.revenue - a.revenue)

  // Summary stats
  const totalSales = sales.reduce((s, x) => s + x.total, 0)
  const totalPaid = sales.reduce((s, x) => s + x.paidAmount, 0)
  const totalOutstanding = totalSales - totalPaid
  const totalItems = sales.reduce((s, x) => s + x.items.length, 0)
  const uniqueMedicines = medicineBreakdown.length
  const avgOrderValue = sales.length > 0 ? totalSales / sales.length : 0
  const firstPurchase = sales.length > 0 ? sales[sales.length - 1].createdAt : null
  const lastPurchase = sales.length > 0 ? sales[0].createdAt : null

  // Payment method breakdown
  const methodMap: Record<string, number> = {}
  for (const sale of sales) {
    for (const p of sale.payments) {
      methodMap[p.method] = (methodMap[p.method] || 0) + p.amount
    }
  }

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
    },
    summary: {
      totalSales: Math.round(totalSales),
      totalPaid: Math.round(totalPaid),
      totalOutstanding: Math.round(totalOutstanding),
      invoiceCount: sales.length,
      totalItems,
      uniqueMedicines,
      avgOrderValue: Math.round(avgOrderValue),
      firstPurchase,
      lastPurchase,
    },
    paymentBreakdown: Object.fromEntries(Object.entries(methodMap).map(([k, v]) => [k, Math.round(v)])),
    medicineBreakdown,
    sales: sales.map(s => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      date: s.createdAt,
      total: s.total,
      paid: s.paidAmount,
      status: s.paymentStatus,
      itemCount: s.items.length,
      items: s.items.map(it => ({
        name: it.medicine?.name || 'Unknown',
        qty: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
      })),
      cashier: s.user?.name,
    })),
  })
}
