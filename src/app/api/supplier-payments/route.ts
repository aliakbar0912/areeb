import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

// POST /api/supplier-payments - record supplier payment
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('purchases.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { supplierId, amount, method = 'CASH', purchaseId, notes } = body || {}
  if (!supplierId || !amount || amount <= 0) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  const pay = await db.supplierPayment.create({
    data: { supplierId, amount, method, notes, userId: user.id },
  })
  if (purchaseId) {
    const purchase = await db.purchase.findUnique({ where: { id: purchaseId } })
    if (purchase) {
      const newPaid = purchase.paidAmount + amount
      const status = newPaid >= purchase.total ? 'PAID' : 'PARTIAL'
      await db.purchase.update({ where: { id: purchaseId }, data: { paidAmount: newPaid, status } })
    }
  }
  await logAudit({ userId: user.id, action: 'SUPPLIER_PAYMENT', entity: 'SupplierPayment', entityId: pay.id, details: `Supplier ${supplierId} PKR ${amount}`, req })
  return NextResponse.json({ payment: pay })
}
