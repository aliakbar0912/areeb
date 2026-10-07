import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

// Database-backed draft PO store.
// A draft PO is a list of medicines pending reorder, with suggested/approved quantities.

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('purchases.edit') && !user.role.permissions.includes('inventory.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const items = await db.draftPO.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('inventory.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { action } = body || {}

  if (action === 'add') {
    const { items } = body
    if (!Array.isArray(items)) return NextResponse.json({ error: 'items array required' }, { status: 400 })
    let added = 0
    for (const it of items) {
      // dedupe by medicineId - update if exists
      const existing = await db.draftPO.findFirst({ where: { medicineId: it.medicineId } })
      const data = {
        medicineId: it.medicineId,
        medicineName: it.medicineName,
        genericName: it.genericName || null,
        manufacturer: it.manufacturer || null,
        currentStock: Number(it.currentStock) || 0,
        minStock: Number(it.minStock) || 0,
        avgWeeklySales: Number(it.avgWeeklySales) || 0,
        suggestedQty: Number(it.suggestedQty) || 0,
        approvedQty: Number(it.approvedQty ?? it.suggestedQty) || 0,
        supplierId: it.supplierId || null,
        estimatedCost: Number(it.estimatedCost) || 0,
        status: 'PENDING',
        createdBy: user.id,
      }
      if (existing) {
        await db.draftPO.update({ where: { id: existing.id }, data })
      } else {
        await db.draftPO.create({ data })
        added++
      }
    }
    await logAudit({ userId: user.id, action: 'DRAFT_PO_ADD', entity: 'DraftPO', details: `${items.length} items (${added} new)`, req })
    const count = await db.draftPO.count()
    return NextResponse.json({ ok: true, count, added })
  }

  if (action === 'update') {
    const { id, approvedQty, supplierId, status } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const existing = await db.draftPO.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const data: any = {}
    if (approvedQty != null) data.approvedQty = Number(approvedQty)
    if (supplierId != null) data.supplierId = supplierId || null
    if (status != null) data.status = status
    const updated = await db.draftPO.update({ where: { id }, data })
    return NextResponse.json({ item: updated })
  }

  if (action === 'remove') {
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await db.draftPO.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'clear') {
    await db.draftPO.deleteMany({})
    await logAudit({ userId: user.id, action: 'DRAFT_PO_CLEAR', entity: 'DraftPO', req })
    return NextResponse.json({ ok: true })
  }

  if (action === 'convert') {
    // Convert selected draft POs into a real purchase.
    // Body: { items: [{ id, approvedQty, supplierId, batchNumber, expiryDate, purchasePrice, salePrice }] }
    // Returns the created purchase id; the caller should redirect/refresh.
    const { items: convertItems, supplierId } = body
    if (!Array.isArray(convertItems) || convertItems.length === 0) {
      return NextResponse.json({ error: 'items required' }, { status: 400 })
    }
    if (!supplierId) return NextResponse.json({ error: 'supplierId required' }, { status: 400 })

    const { nextInvoiceNumber } = await import('@/lib/audit')
    const invoiceNumber = await nextInvoiceNumber('purchase')

    let subtotal = 0
    const purchaseItems: any[] = []
    for (const ci of convertItems) {
      const draft = await db.draftPO.findUnique({ where: { id: ci.id } })
      if (!draft) continue
      const qty = Number(ci.approvedQty ?? draft.approvedQty)
      const purchasePrice = Number(ci.purchasePrice ?? draft.estimatedCost / Math.max(1, draft.approvedQty))
      const lineTotal = qty * purchasePrice
      subtotal += lineTotal
      purchaseItems.push({
        medicineId: draft.medicineId,
        batchNumber: ci.batchNumber || `BATCH-${Date.now().toString(36).toUpperCase()}`,
        expiryDate: ci.expiryDate ? new Date(ci.expiryDate) : new Date(Date.now() + 365 * 86400000),
        quantity: qty,
        freeQuantity: 0,
        purchasePrice,
        salePrice: Number(ci.salePrice) || 0,
        mrpPerUnit: Number(ci.salePrice) || 0,
        discount: 0,
        total: lineTotal,
        scheme: null,
      })
    }
    if (purchaseItems.length === 0) {
      return NextResponse.json({ error: 'No valid draft items to convert' }, { status: 400 })
    }

    const total = subtotal
    const purchase = await db.purchase.create({
      data: {
        invoiceNumber,
        supplierId,
        userId: user.id,
        invoiceDate: new Date(),
        subtotal,
        discount: 0,
        total,
        paidAmount: 0,
        status: 'UNPAID',
        items: { create: purchaseItems },
      },
      include: { items: true },
    })

    // Update inventory for each item (same as main purchases API)
    for (const it of purchase.items) {
      const med = await db.medicine.findUnique({ where: { id: it.medicineId } })
      if (!med) continue
      let batch = await db.medicineBatch.findFirst({
        where: { medicineId: it.medicineId, batchNumber: it.batchNumber },
      })
      const effectiveCost = it.quantity > 0 ? (it.total / it.quantity) : 0
      if (batch) {
        batch = await db.medicineBatch.update({
          where: { id: batch.id },
          data: {
            quantity: { increment: it.quantity },
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
            quantity: it.quantity,
            purchasePrice: effectiveCost,
            salePrice: it.salePrice || med.retailPrice,
            supplierId,
            purchaseId: purchase.id,
          },
        })
      }
      await db.medicine.update({ where: { id: it.medicineId }, data: { purchasePrice: effectiveCost } })
      await db.stockTransaction.create({
        data: {
          medicineId: it.medicineId, batchId: batch.id, type: 'PURCHASE',
          quantity: it.quantity, refType: 'Purchase', refId: purchase.id,
        },
      })
    }

    // Mark draft items as CONVERTED (don't delete - keep audit trail)
    await db.draftPO.updateMany({
      where: { id: { in: convertItems.map((c: any) => c.id) } },
      data: { status: 'CONVERTED' },
    })

    await logAudit({ userId: user.id, action: 'DRAFT_PO_CONVERT', entity: 'Purchase', entityId: purchase.id, details: `${invoiceNumber} PKR ${total.toFixed(0)} (${purchaseItems.length} items)`, req })
    return NextResponse.json({ ok: true, purchaseId: purchase.id, invoiceNumber, total })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
