import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const customers = await db.customer.findMany({
    orderBy: { name: 'asc' },
    include: {
      sales: { select: { total: true, paidAmount: true } },
      payments: { select: { amount: true } },
    },
  })
  const result = customers.map(c => {
    const totalSales = c.sales.reduce((s, x) => s + x.total, 0)
    const totalPaid = c.sales.reduce((s, x) => s + x.paidAmount, 0) + c.payments.reduce((s, x) => s + x.amount, 0)
    const outstanding = totalSales - totalPaid
    return {
      id: c.id, name: c.name, phone: c.phone, address: c.address, notes: c.notes,
      createdAt: c.createdAt,
      totalSales, totalPaid, outstanding,
    }
  })
  return NextResponse.json({ customers: result })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('customers.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const c = await db.customer.create({
    data: {
      name: body.name,
      phone: body.phone || null,
      address: body.address || null,
      notes: body.notes || null,
    },
  })
  await db.auditLog.create({ data: { userId: user.id, action: 'CUSTOMER_CREATE', entity: 'Customer', entityId: c.id, details: c.name } })
  return NextResponse.json({ customer: c })
}
