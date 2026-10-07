import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const medicineId = url.searchParams.get('medicineId')
  const where: any = {}
  if (medicineId) where.medicineId = medicineId
  const txns = await db.stockTransaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { medicine: true, batch: true },
    take: 200,
  })
  return NextResponse.json({
    txns: txns.map(t => ({
      id: t.id,
      type: t.type,
      quantity: t.quantity,
      medicine: t.medicine?.name,
      batch: t.batch?.batchNumber,
      refType: t.refType,
      notes: t.notes,
      createdAt: t.createdAt,
    })),
  })
}
