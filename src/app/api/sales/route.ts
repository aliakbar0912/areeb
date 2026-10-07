import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit, nextInvoiceNumber } from '@/lib/audit'
import { getSettingBool } from '@/lib/settings'

// GET /api/sales?from=&to=&customerId=&q=
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const customerId = url.searchParams.get('customerId')
  const q = url.searchParams.get('q') || ''
  const limit = Number(url.searchParams.get('limit') || '50')

  const where: any = {}
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = new Date(from)
    if (to) where.createdAt.lte = new Date(to + 'T23:59:59.999Z')
  }
  if (customerId) where.customerId = customerId
  if (q) {
    where.OR = [
      { invoiceNumber: { contains: q } },
      { customer: { name: { contains: q } } },
    ]
  }

  const sales = await db.sale.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      customer: true,
      items: { include: { medicine: true } },
      payments: true,
      returns: { include: { items: true }, orderBy: { createdAt: 'desc' } },
    },
  })
  return NextResponse.json({ sales })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('pos.use')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { items, customerId, discount, discountType, taxRate, payments, restoreStock = true } = body || {}
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  }

  const allowNegative = await getSettingBool('stock.allowNegative', false)

  // FEFO: select batch with earliest expiry for each medicine
  const saleItems: any[] = []
  let subtotal = 0
  const stockChanges: { batchId: string; medicineId: string; qty: number; batchNumber: string }[] = []

  // group by medicine and aggregate quantity in base units
  for (const it of items) {
    const medicineId = it.medicineId
    const requestedQty = Number(it.quantity) // in base units
    if (!requestedQty || requestedQty <= 0) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }
    // determine unit factor & unit price from selected unit
    const unitFactor = Number(it.unitFactor) || 1
    const unitPrice = Number(it.unitPrice) || 0
    const lineTotal = unitPrice * (requestedQty / unitFactor)
    subtotal += lineTotal

    let remaining = requestedQty
    let chosenBatchId: string | null = null
    let chosenBatchNumber: string | null = null

    if (it.batchId) {
      // specific batch requested
      const b = await db.medicineBatch.findUnique({ where: { id: it.batchId } })
      if (!b) return NextResponse.json({ error: 'Batch not found' }, { status: 400 })
      if (b.expiryDate < new Date()) return NextResponse.json({ error: `Batch ${b.batchNumber} is expired` }, { status: 400 })
      if (b.quantity < remaining && !allowNegative) {
        return NextResponse.json({ error: `Insufficient stock in batch ${b.batchNumber} (have ${b.quantity}, need ${remaining})` }, { status: 400 })
      }
      chosenBatchId = b.id
      chosenBatchNumber = b.batchNumber
      stockChanges.push({ batchId: b.id, medicineId, qty: -remaining, batchNumber: b.batchNumber })
    } else {
      // FEFO: pick earliest-expiring non-expired batches
      const batches = await db.medicineBatch.findMany({
        where: { medicineId, expiryDate: { gt: new Date() } },
        orderBy: { expiryDate: 'asc' },
      })
      let acc = 0
      for (const b of batches) {
        if (remaining <= 0) break
        const use = Math.min(b.quantity, remaining)
        if (use <= 0) continue
        // for FEFO split, we record each consumed batch
        stockChanges.push({ batchId: b.id, medicineId, qty: -use, batchNumber: b.batchNumber })
        remaining -= use
        acc += use
        if (!chosenBatchId) { chosenBatchId = b.id; chosenBatchNumber = b.batchNumber }
      }
      if (remaining > 0 && !allowNegative) {
        return NextResponse.json({ error: 'Insufficient stock' }, { status: 400 })
      }
      if (remaining > 0) {
        // allow negative -> use last batch
        const b = batches[batches.length - 1]
        if (b) {
          stockChanges.push({ batchId: b.id, medicineId, qty: -remaining, batchNumber: b.batchNumber })
          chosenBatchId = chosenBatchId || b.id
          chosenBatchNumber = chosenBatchNumber || b.batchNumber
        }
      }
    }

    saleItems.push({
      medicineId,
      batchId: chosenBatchId,
      batchNumber: chosenBatchNumber,
      quantity: requestedQty,
      unitType: it.unitType || 'TABLET',
      unitFactor,
      unitPrice,
      discount: Number(it.discount) || 0,
      total: lineTotal - (Number(it.discount) || 0),
    })
  }

  // totals
  const discountAmt = discountType === 'PERCENT' ? subtotal * (Number(discount) / 100) : Number(discount || 0)
  const taxableAmount = subtotal - discountAmt
  const tax = taxableAmount * (Number(taxRate || 0) / 100)
  const total = taxableAmount + tax
  const paidAmount = (payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0)
  const remainingAmount = Math.max(0, total - paidAmount)
  const paymentStatus = remainingAmount <= 0.01 ? 'PAID' : (paidAmount > 0 ? 'PARTIAL' : 'CREDIT')

  const invoiceNumber = await nextInvoiceNumber('invoice')

  // create sale
  const sale = await db.sale.create({
    data: {
      invoiceNumber,
      customerId: customerId || null,
      userId: user.id,
      subtotal,
      discount: discountAmt,
      discountType: discountType || 'AMOUNT',
      tax,
      taxRate: Number(taxRate || 0),
      total,
      paidAmount,
      remainingAmount,
      paymentStatus,
      items: { create: saleItems },
      payments: payments && payments.length > 0 ? { create: payments.map((p: any) => ({
        method: p.method || 'CASH',
        amount: Number(p.amount),
      })) } : undefined,
    },
    include: { items: true, payments: true, customer: true },
  })

  // deduct stock
  for (const sc of stockChanges) {
    await db.medicineBatch.update({
      where: { id: sc.batchId },
      data: { quantity: { decrement: -sc.qty } },
    })
    await db.stockTransaction.create({
      data: {
        medicineId: sc.medicineId, batchId: sc.batchId, type: 'SALE',
        quantity: sc.qty, refType: 'Sale', refId: sale.id,
      },
    })
  }

  await logAudit({ userId: user.id, action: 'SALE_CREATE', entity: 'Sale', entityId: sale.id, details: `Invoice ${invoiceNumber} PKR ${total.toFixed(0)}`, req })

  // Auto-earn loyalty points for the customer (if loyalty is enabled and customer is set)
  if (customerId) {
    try {
      const { getSettings, getSettingNumber } = await import('@/lib/settings')
      const loyaltyEnabled = (await getSettings())['loyalty.enabled'] !== 'false'
      if (loyaltyEnabled && total > 0) {
        const rupeesPerPoint = await getSettingNumber('loyalty.rupeesPerPoint', 100)
        if (rupeesPerPoint > 0) {
          const earnedPoints = Math.floor(total / rupeesPerPoint)
          if (earnedPoints > 0) {
            await db.loyaltyTransaction.create({
              data: {
                customerId,
                type: 'EARN',
                points: earnedPoints,
                description: `Earned from ${invoiceNumber} (Rs ${total.toFixed(0)})`,
                refType: 'Sale',
                refId: sale.id,
                userId: user.id,
              },
            })
          }
        }
      }
    } catch (e) {
      // loyalty earning failure should not fail the sale
      console.error('Loyalty earning failed', e)
    }
  }

  return NextResponse.json({ sale })
}
