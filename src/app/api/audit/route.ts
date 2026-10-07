import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('audit.view')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const url = new URL(req.url)
  const limit = Number(url.searchParams.get('limit') || '100')
  const action = url.searchParams.get('action')
  const where: any = {}
  if (action) where.action = { contains: action }
  const logs = await db.auditLog.findMany({
    where, orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, email: true } } },
    take: limit,
  })
  return NextResponse.json({ logs })
}

// mark notification as read - separate route; here we keep single-purpose GET
