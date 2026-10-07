import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const category = url.searchParams.get('category')
  const where: any = {}
  if (from || to) {
    where.date = {}
    if (from) where.date.gte = new Date(from)
    if (to) where.date.lte = new Date(to + 'T23:59:59.999Z')
  }
  if (category) where.category = category
  const expenses = await db.expense.findMany({
    where, orderBy: { date: 'desc' }, include: { user: { select: { name: true } } }, take: 200,
  })
  return NextResponse.json({ expenses })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('expenses.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const e = await db.expense.create({
    data: {
      category: body.category,
      amount: Number(body.amount),
      description: body.description || null,
      date: body.date ? new Date(body.date) : new Date(),
      userId: user.id,
    },
  })
  await logAudit({ userId: user.id, action: 'EXPENSE_CREATE', entity: 'Expense', entityId: e.id, details: `${body.category} PKR ${body.amount}`, req })
  return NextResponse.json({ expense: e })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('expenses.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await db.expense.delete({ where: { id } })
  await logAudit({ userId: user.id, action: 'EXPENSE_DELETE', entity: 'Expense', entityId: id, req })
  return NextResponse.json({ ok: true })
}
