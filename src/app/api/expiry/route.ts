import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettingNumber } from '@/lib/settings'

export async function GET() {
  const batches = await db.medicineBatch.findMany({
    include: { medicine: true, supplier: true },
    where: { quantity: { gt: 0 } },
  })
  const now = new Date()
  const shortDays = await getSettingNumber('stock.expiryShortDays', 30)
  const groups = {
    expired: [] as any[],
    days30: [] as any[],
    days60: [] as any[],
    days90: [] as any[],
    safe: [] as any[],
  }
  for (const b of batches) {
    const days = Math.floor((new Date(b.expiryDate).getTime() - now.getTime()) / 86400000)
    const item = {
      id: b.id,
      medicine: b.medicine?.name,
      genericName: b.medicine?.genericName,
      manufacturer: b.medicine?.manufacturer,
      batchNumber: b.batchNumber,
      expiry: new Date(b.expiryDate).toISOString().slice(0, 10),
      quantity: b.quantity,
      purchasePrice: b.purchasePrice,
      loss: b.quantity * b.purchasePrice,
      days,
    }
    if (days < 0) groups.expired.push(item)
    else if (days <= shortDays) groups.days30.push(item)
    else if (days <= 60) groups.days60.push(item)
    else if (days <= 90) groups.days90.push(item)
    else groups.safe.push(item)
  }
  return NextResponse.json({
    ...groups,
    totals: {
      expired: groups.expired.length,
      days30: groups.days30.length,
      days60: groups.days60.length,
      days90: groups.days90.length,
      safe: groups.safe.length,
      expiredLoss: groups.expired.reduce((s, x) => s + x.loss, 0),
    },
  })
}
