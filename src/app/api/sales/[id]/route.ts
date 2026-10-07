import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sale = await db.sale.findUnique({
    where: { id },
    include: {
      customer: true, items: { include: { medicine: true } }, payments: true, user: true,
      returns: { include: { items: true } },
    },
  })
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ sale })
}
