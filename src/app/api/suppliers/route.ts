import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const suppliers = await db.supplier.findMany({
    orderBy: { name: 'asc' },
    include: {
      purchases: { select: { total: true, paidAmount: true } },
      payments: { select: { amount: true } },
    },
  })
  const result = suppliers.map(s => {
    const totalPurchases = s.purchases.reduce((sum, p) => sum + p.total, 0)
    const totalPaidToSupplier = s.payments.reduce((sum, p) => sum + p.amount, 0)
    const payable = totalPurchases - totalPaidToSupplier + s.openingBalance
    return {
      id: s.id, name: s.name, company: s.company, phone: s.phone, email: s.email,
      address: s.address, openingBalance: s.openingBalance,
      createdAt: s.createdAt,
      totalPurchases,
      totalPaid: totalPaidToSupplier,
      payable,
    }
  })
  return NextResponse.json({ suppliers: result })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('suppliers.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const sup = await db.supplier.create({
    data: {
      name: body.name,
      company: body.company || null,
      phone: body.phone || null,
      email: body.email || null,
      address: body.address || null,
      openingBalance: Number(body.openingBalance) || 0,
    },
  })
  await db.auditLog.create({ data: { userId: user.id, action: 'SUPPLIER_CREATE', entity: 'Supplier', entityId: sup.id, details: sup.name } })
  return NextResponse.json({ supplier: sup })
}
