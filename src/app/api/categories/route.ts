import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const categories = await db.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { medicines: true } } },
  })
  return NextResponse.json({
    categories: categories.map(c => ({
      id: c.id, name: c.name, description: c.description, count: c._count.medicines,
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('inventory.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const c = await db.category.create({ data: { name: body.name, description: body.description || null } })
  return NextResponse.json({ category: c })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('inventory.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await db.category.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
