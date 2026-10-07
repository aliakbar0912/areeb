import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

// GET /api/credit - list customers with outstanding credit
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const onlyUnpaid = url.searchParams.get('onlyUnpaid') === 'true'
  const customers = await db.customer.findMany({
    include: {
      sales: { select: { total: true, paidAmount: true, createdAt: true, invoiceNumber: true, id: true } },
      payments: { select: { amount: true, createdAt: true, method: true } },
    },
  })
  const result = customers.map(c => {
    const totalSales = c.sales.reduce((s, x) => s + x.total, 0)
    const totalPaidSales = c.sales.reduce((s, x) => s + x.paidAmount, 0)
    const extraPayments = c.payments.reduce((s, x) => s + x.amount, 0)
    const outstanding = totalSales - totalPaidSales - extraPayments
    return {
      id: c.id, name: c.name, phone: c.phone,
      totalCredit: totalSales,
      totalPaid: totalPaidSales + extraPayments,
      remaining: outstanding,
      lastPayment: c.payments.length > 0 ? c.payments[0].createdAt : null,
      due: outstanding > 0,
    }
  }).filter(r => !onlyUnpaid || r.remaining > 0)
  return NextResponse.json({ customers: result })
}

// POST - record a customer credit payment
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('credit.payment')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { customerId, amount, method = 'CASH', saleId, notes } = body || {}
  if (!customerId || !amount || amount <= 0) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  const pay = await db.customerPayment.create({
    data: { customerId, saleId: saleId || null, amount, method, notes, userId: user.id },
  })
  if (saleId) {
    // update sale paid/remaining
    const sale = await db.sale.findUnique({ where: { id: saleId } })
    if (sale) {
      const newPaid = sale.paidAmount + amount
      const newRem = Math.max(0, sale.total - newPaid)
      const status = newRem <= 0.01 ? 'PAID' : 'PARTIAL'
      await db.sale.update({ where: { id: saleId }, data: { paidAmount: newPaid, remainingAmount: newRem, paymentStatus: status } })
    }
  }
  await logAudit({ userId: user.id, action: 'CUSTOMER_PAYMENT', entity: 'CustomerPayment', entityId: pay.id, details: `Customer ${customerId} PKR ${amount}`, req })
  return NextResponse.json({ payment: pay })
}
