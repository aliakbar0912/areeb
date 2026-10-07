import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supplier = await db.supplier.findUnique({
    where: { id },
    include: {
      purchases: {
        orderBy: { createdAt: 'desc' },
        include: { items: { include: { medicine: true } } },
        take: 100,
      },
      payments: { orderBy: { createdAt: 'desc' }, take: 100 },
      purchaseReturns: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  })
  if (!supplier) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ supplier })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('suppliers.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const sup = await db.supplier.update({
    where: { id },
    data: {
      name: body.name,
      company: body.company || null,
      phone: body.phone || null,
      email: body.email || null,
      address: body.address || null,
      openingBalance: Number(body.openingBalance) || 0,
    },
  })
  await db.auditLog.create({ data: { userId: user.id, action: 'SUPPLIER_UPDATE', entity: 'Supplier', entityId: id, details: sup.name } })
  return NextResponse.json({ supplier: sup })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('suppliers.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await db.supplier.delete({ where: { id } })
  await db.auditLog.create({ data: { userId: user.id, action: 'SUPPLIER_DELETE', entity: 'Supplier', entityId: id } })
  return NextResponse.json({ ok: true })
}
