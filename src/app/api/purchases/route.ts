import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit, nextInvoiceNumber } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const supplierId = url.searchParams.get('supplierId')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const q = url.searchParams.get('q') || ''
  const where: any = {}
  if (supplierId) where.supplierId = supplierId
  if (from || to) {
    where.invoiceDate = {}
    if (from) where.invoiceDate.gte = new Date(from)
    if (to) where.invoiceDate.lte = new Date(to + 'T23:59:59.999Z')
  }
  if (q) {
    where.OR = [
      { invoiceNumber: { contains: q } },
      { supplier: { name: { contains: q } } },
    ]
  }
  const purchases = await db.purchase.findMany({
    where, orderBy: { invoiceDate: 'desc' },
    include: { supplier: true, items: { include: { medicine: true } } },
    take: 200,
  })
  return NextResponse.json({ purchases })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('purchases.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { supplierId, invoiceNumber, invoiceDate, items, paidAmount = 0, discount = 0 } = body || {}
  if (!supplierId) return NextResponse.json({ error: 'Supplier required' }, { status: 400 })
  if (!items || items.length === 0) return NextResponse.json({ error: 'No items' }, { status: 400 })

  let subtotal = 0
  const purchaseItems: any[] = []
  for (const it of items) {
    const qty = Number(it.quantity) || 0
    const freeQty = Number(it.freeQuantity) || 0
    const purchasePrice = Number(it.purchasePrice) || 0
    const lineTotal = qty * purchasePrice
    subtotal += lineTotal
    purchaseItems.push({
      medicineId: it.medicineId,
      batchNumber: it.batchNumber,
      expiryDate: new Date(it.expiryDate),
      quantity: qty,
      freeQuantity: freeQty,
      purchasePrice,
      salePrice: Number(it.salePrice) || 0,
      mrpPerUnit: Number(it.mrpPerUnit) || 0,
      discount: Number(it.discount) || 0,
      total: lineTotal - (Number(it.discount) || 0),
      scheme: it.scheme || null,
    })
  }
  const total = subtotal - Number(discount || 0)
  const paid = Number(paidAmount) || 0
  const status = paid >= total ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'UNPAID')

  const num = invoiceNumber || await nextInvoiceNumber('purchase')
  const purchase = await db.purchase.create({
    data: {
      invoiceNumber: num,
      supplierId,
      userId: user.id,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      subtotal,
      discount: Number(discount || 0),
      total,
      paidAmount: paid,
      status,
      items: { create: purchaseItems },
    },
    include: { items: true },
  })

  // update inventory: for each item, create or update batch + stock txn
  for (const it of purchase.items) {
    const med = await db.medicine.findUnique({ where: { id: it.medicineId } })
    if (!med) continue
    // try find existing batch with same number
    let batch = await db.medicineBatch.findFirst({
      where: { medicineId: it.medicineId, batchNumber: it.batchNumber },
    })
    const effectiveCost = it.quantity > 0 ? (it.total / it.quantity) : 0
    if (batch) {
      batch = await db.medicineBatch.update({
        where: { id: batch.id },
        data: {
          quantity: { increment: it.quantity + it.freeQuantity },
          purchasePrice: effectiveCost || batch.purchasePrice,
          supplierId,
          purchaseId: purchase.id,
        },
      })
    } else {
      batch = await db.medicineBatch.create({
        data: {
          medicineId: it.medicineId,
          batchNumber: it.batchNumber,
          expiryDate: it.expiryDate,
          packSizeBox: med.unitType === 'TABLET' || med.unitType === 'CAPSULE' ? 100 : 1,
          packSizeStrip: med.unitType === 'TABLET' || med.unitType === 'CAPSULE' ? 10 : 1,
          quantity: it.quantity + it.freeQuantity,
          purchasePrice: effectiveCost,
          salePrice: it.salePrice || med.retailPrice,
          supplierId,
          purchaseId: purchase.id,
        },
      })
    }
    // update medicine's purchase price reference
    await db.medicine.update({
      where: { id: it.medicineId },
      data: { purchasePrice: effectiveCost },
    })
    await db.stockTransaction.create({
      data: {
        medicineId: it.medicineId, batchId: batch.id, type: 'PURCHASE',
        quantity: it.quantity + it.freeQuantity, refType: 'Purchase', refId: purchase.id,
      },
    })
  }

  await logAudit({ userId: user.id, action: 'PURCHASE_CREATE', entity: 'Purchase', entityId: purchase.id, details: `${num} PKR ${total.toFixed(0)}`, req })
  return NextResponse.json({ purchase })
}
