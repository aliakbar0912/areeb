import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const q = url.searchParams.get('q') || ''
  if (!q || q.length < 1) return NextResponse.json({ results: { medicines: [], customers: [], suppliers: [], sales: [], purchases: [], batches: [] } })

  const [medicines, customers, suppliers, sales, purchases, batches] = await Promise.all([
    db.medicine.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { genericName: { contains: q } },
          { manufacturer: { contains: q } },
          { barcode: { contains: q } },
        ],
      },
      take: 10,
      include: { category: true },
    }),
    db.customer.findMany({
      where: { OR: [{ name: { contains: q } }, { phone: { contains: q } }] },
      take: 10,
    }),
    db.supplier.findMany({
      where: { OR: [{ name: { contains: q } }, { company: { contains: q } }, { phone: { contains: q } }] },
      take: 10,
    }),
    db.sale.findMany({
      where: { OR: [{ invoiceNumber: { contains: q } }, { customer: { name: { contains: q } } }] },
      take: 10,
      include: { customer: true },
    }),
    db.purchase.findMany({
      where: { OR: [{ invoiceNumber: { contains: q } }, { supplier: { name: { contains: q } } }] },
      take: 10,
      include: { supplier: true },
    }),
    db.medicineBatch.findMany({
      where: { batchNumber: { contains: q } },
      take: 10,
      include: { medicine: true },
    }),
  ])

  return NextResponse.json({
    results: {
      medicines: medicines.map(m => ({ id: m.id, type: 'medicine', name: m.name, sub: m.genericName || m.manufacturer || '', barcode: m.barcode })),
      customers: customers.map(c => ({ id: c.id, type: 'customer', name: c.name, sub: c.phone || '' })),
      suppliers: suppliers.map(s => ({ id: s.id, type: 'supplier', name: s.name, sub: s.company || s.phone || '' })),
      sales: sales.map(s => ({ id: s.id, type: 'sale', name: s.invoiceNumber, sub: s.customer?.name || 'Walk-in', total: s.total })),
      purchases: purchases.map(p => ({ id: p.id, type: 'purchase', name: p.invoiceNumber, sub: p.supplier?.name || '', total: p.total })),
      batches: batches.map(b => ({ id: b.id, type: 'batch', name: `${b.medicine?.name} - ${b.batchNumber}`, sub: b.expiryDate.toISOString().slice(0, 10) })),
    },
  })
}
