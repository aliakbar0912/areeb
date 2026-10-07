import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit, nextInvoiceNumber } from '@/lib/audit'

// POST /api/sales/[id]/return
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('sales.return')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const { items, reason, restoreStock = true } = body || {}
  if (!items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'No items to return' }, { status: 400 })

  const sale = await db.sale.findUnique({
    where: { id },
    include: { items: true, customer: true },
  })
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

  let total = 0
  const returnItems: any[] = []
  for (const it of items) {
    const saleItem = sale.items.find(si => si.id === it.saleItemId)
    if (!saleItem) return NextResponse.json({ error: 'Invalid sale item' }, { status: 400 })
    const qty = Number(it.quantity)
    if (qty <= 0 || qty > saleItem.quantity) return NextResponse.json({ error: 'Invalid return quantity' }, { status: 400 })
    const unitPrice = saleItem.unitPrice
    const lineTotal = unitPrice * (qty / saleItem.unitFactor)
    total += lineTotal
    returnItems.push({
      saleItemId: saleItem.id,
      medicineId: saleItem.medicineId,
      batchId: saleItem.batchId,
      quantity: qty,
      unitPrice,
      total: lineTotal,
    })

    if (restoreStock && saleItem.batchId) {
      await db.medicineBatch.update({
        where: { id: saleItem.batchId },
        data: { quantity: { increment: qty } },
      })
      await db.stockTransaction.create({
        data: {
          medicineId: saleItem.medicineId, batchId: saleItem.batchId, type: 'SALE_RETURN',
          quantity: qty, refType: 'SalesReturn', refId: sale.id,
        },
      })
    }
  }

  const returnNumber = await nextInvoiceNumber('salesReturn')
  const ret = await db.salesReturn.create({
    data: {
      returnNumber,
      saleId: sale.id,
      customerId: sale.customerId,
      userId: user.id,
      total,
      reason: reason || null,
      restoreStock,
      items: { create: returnItems },
    },
  })

  // adjust sale paid/remaining if needed (no auto refund adjustment - recorded)
  await logAudit({ userId: user.id, action: 'SALE_RETURN', entity: 'SalesReturn', entityId: ret.id, details: `Return ${returnNumber} PKR ${total.toFixed(0)}`, req })
  return NextResponse.json({ saleReturn: ret })
}
