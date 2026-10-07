import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const med = await db.medicine.findUnique({
    where: { id },
    include: { category: true, batches: { orderBy: { expiryDate: 'asc' } } },
  })
  if (!med) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ medicine: med })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('inventory.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const med = await db.medicine.update({
    where: { id },
    data: {
      name: body.name,
      genericName: body.genericName ?? null,
      manufacturer: body.manufacturer ?? null,
      categoryId: body.categoryId ?? null,
      barcode: body.barcode || null,
      hsnCode: body.hsnCode ?? null,
      prescriptionRequired: !!body.prescriptionRequired,
      unitType: body.unitType ?? 'TABLET',
      purchasePrice: Number(body.purchasePrice) || 0,
      retailPrice: Number(body.retailPrice) || 0,
      stripPrice: Number(body.stripPrice) || 0,
      boxPrice: Number(body.boxPrice) || 0,
      minStock: Number(body.minStock) || 0,
      maxStock: Number(body.maxStock) || 0,
      rackLocation: body.rackLocation ?? null,
      notes: body.notes ?? null,
      isActive: body.isActive !== false,
    },
  })
  await logAudit({ userId: user.id, action: 'MEDICINE_UPDATE', entity: 'Medicine', entityId: id, details: med.name, req })
  return NextResponse.json({ medicine: med })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('inventory.delete')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  // soft delete: deactivate
  const med = await db.medicine.update({ where: { id }, data: { isActive: false } })
  await logAudit({ userId: user.id, action: 'MEDICINE_DEACTIVATE', entity: 'Medicine', entityId: id, details: med.name, req })
  return NextResponse.json({ ok: true })
}
