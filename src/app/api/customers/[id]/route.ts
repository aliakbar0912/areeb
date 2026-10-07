import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      sales: {
        orderBy: { createdAt: 'desc' },
        include: { items: { include: { medicine: true } } },
        take: 100,
      },
      payments: { orderBy: { createdAt: 'desc' }, take: 100 },
    },
  })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ customer })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('customers.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const c = await db.customer.update({
    where: { id },
    data: {
      name: body.name,
      phone: body.phone || null,
      address: body.address || null,
      notes: body.notes || null,
    },
  })
  await db.auditLog.create({ data: { userId: user.id, action: 'CUSTOMER_UPDATE', entity: 'Customer', entityId: id, details: c.name } })
  return NextResponse.json({ customer: c })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('customers.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await db.customer.delete({ where: { id } })
  await db.auditLog.create({ data: { userId: user.id, action: 'CUSTOMER_DELETE', entity: 'Customer', entityId: id } })
  return NextResponse.json({ ok: true })
}
