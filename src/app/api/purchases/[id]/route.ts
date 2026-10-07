import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit, nextInvoiceNumber } from '@/lib/audit'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const purchase = await db.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: { include: { medicine: true } },
      user: true,
      returns: { include: { items: true } },
    },
  })
  if (!purchase) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ purchase })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // purchase return
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('purchases.return')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const { items, reason, restoreStock = true } = body || {}
  if (!items || items.length === 0) return NextResponse.json({ error: 'No items' }, { status: 400 })
  const purchase = await db.purchase.findUnique({
    where: { id },
    include: { items: { include: { medicine: true } }, supplier: true },
  })
  if (!purchase) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })

  let total = 0
  const returnItems: any[] = []
  for (const it of items) {
    const pi = purchase.items.find(x => x.id === it.purchaseItemId)
    if (!pi) return NextResponse.json({ error: 'Invalid item' }, { status: 400 })
    const qty = Number(it.quantity)
    if (qty <= 0 || qty > pi.quantity) return NextResponse.json({ error: 'Invalid qty' }, { status: 400 })
    const lineTotal = pi.purchasePrice * qty
    total += lineTotal
    returnItems.push({ medicineId: pi.medicineId, batchId: null, quantity: qty, unitPrice: pi.purchasePrice, total: lineTotal })

    if (restoreStock) {
      // decrement stock - find batch by batchNumber & medicine
      const batch = await db.medicineBatch.findFirst({
        where: { medicineId: pi.medicineId, batchNumber: pi.batchNumber },
      })
      if (batch) {
        await db.medicineBatch.update({
          where: { id: batch.id },
          data: { quantity: { decrement: qty } },
        })
        await db.stockTransaction.create({
          data: {
            medicineId: pi.medicineId, batchId: batch.id, type: 'PURCHASE_RETURN',
            quantity: -qty, refType: 'PurchaseReturn',
          },
        })
      }
    }
  }
  const returnNumber = await nextInvoiceNumber('purchaseReturn')
  const ret = await db.purchaseReturn.create({
    data: {
      returnNumber,
      purchaseId: purchase.id,
      supplierId: purchase.supplierId,
      userId: user.id,
      total,
      reason: reason || null,
      restoreStock,
      items: { create: returnItems },
    },
  })
  await logAudit({ userId: user.id, action: 'PURCHASE_RETURN', entity: 'PurchaseReturn', entityId: ret.id, details: `${returnNumber} PKR ${total.toFixed(0)}`, req })
  return NextResponse.json({ purchaseReturn: ret })
}
