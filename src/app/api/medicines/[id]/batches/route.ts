import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batches = await db.medicineBatch.findMany({
    where: { medicineId: id },
    orderBy: { expiryDate: 'asc' },
  })
  return NextResponse.json({ batches })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('inventory.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const batch = await db.medicineBatch.create({
    data: {
      medicineId: id,
      batchNumber: body.batchNumber,
      expiryDate: new Date(body.expiryDate),
      packSizeBox: Number(body.packSizeBox) || 1,
      packSizeStrip: Number(body.packSizeStrip) || 1,
      quantity: Number(body.quantity) || 0,
      purchasePrice: Number(body.purchasePrice) || 0,
      salePrice: Number(body.salePrice) || 0,
      freeQuantity: Number(body.freeQuantity) || 0,
      supplierId: body.supplierId || null,
    },
  })
  if (batch.quantity > 0) {
    await db.stockTransaction.create({
      data: {
        medicineId: id, batchId: batch.id, type: 'ADJUSTMENT_IN',
        quantity: batch.quantity, refType: 'Manual', notes: 'New batch added',
      },
    })
  }
  await logAudit({ userId: user.id, action: 'BATCH_CREATE', entity: 'MedicineBatch', entityId: batch.id, details: `Med: ${id} Batch: ${body.batchNumber}`, req })
  return NextResponse.json({ batch })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('inventory.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  // update batch
  const existing = await db.medicineBatch.findUnique({ where: { id: body.id } })
  if (!existing) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  const oldQty = existing.quantity
  const newQty = Number(body.quantity) || 0
  const batch = await db.medicineBatch.update({
    where: { id: body.id },
    data: {
      batchNumber: body.batchNumber,
      expiryDate: new Date(body.expiryDate),
      packSizeBox: Number(body.packSizeBox) || 1,
      packSizeStrip: Number(body.packSizeStrip) || 1,
      quantity: newQty,
      purchasePrice: Number(body.purchasePrice) || 0,
      salePrice: Number(body.salePrice) || 0,
      supplierId: body.supplierId || null,
    },
  })
  if (newQty !== oldQty) {
    await db.stockTransaction.create({
      data: {
        medicineId: id, batchId: batch.id, type: 'ADJUSTMENT_IN',
        quantity: newQty - oldQty, refType: 'Manual', notes: 'Batch quantity adjusted',
      },
    })
  }
  await logAudit({ userId: user.id, action: 'BATCH_UPDATE', entity: 'MedicineBatch', entityId: batch.id, details: `Qty: ${oldQty} -> ${newQty}`, req })
  return NextResponse.json({ batch })
}
