import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const meds = await db.medicine.findMany({
    orderBy: { name: 'asc' },
    include: { category: true },
  })
  // compute current stock per medicine
  const result = await Promise.all(meds.map(async (m) => {
    const batches = await db.medicineBatch.findMany({ where: { medicineId: m.id } })
    const stock = batches.reduce((s, b) => s + b.quantity, 0)
    const expired = batches.filter(b => new Date(b.expiryDate) < new Date())
    const nearExpiry = batches.filter(b => {
      const days = (new Date(b.expiryDate).getTime() - Date.now()) / 86400000
      return days >= 0 && days <= 90
    })
    return {
      ...m,
      categoryName: m.category?.name ?? null,
      stock,
      batchesCount: batches.length,
      hasExpired: expired.length > 0,
      hasNearExpiry: nearExpiry.length > 0,
    }
  }))
  return NextResponse.json({ items: result })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('inventory.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const med = await db.medicine.create({
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
  await db.auditLog.create({
    data: { userId: user.id, action: 'MEDICINE_CREATE', entity: 'Medicine', entityId: med.id, details: med.name },
  })
  return NextResponse.json({ medicine: med })
}
