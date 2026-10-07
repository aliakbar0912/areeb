import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('users.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const users = await db.user.findMany({ include: { role: true }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json({
    users: users.map(u => ({
      id: u.id, email: u.email, name: u.name, phone: u.phone,
      role: u.role.name, roleId: u.roleId, isActive: u.isActive,
      lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('users.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  if (!body.email || !body.name || !body.roleId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const existing = await db.user.findUnique({ where: { email: body.email.toLowerCase() } })
  if (existing) return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
  const u = await db.user.create({
    data: {
      email: body.email.toLowerCase(),
      name: body.name,
      phone: body.phone || null,
      passwordHash: hashPassword(body.password || 'changeme123'),
      roleId: body.roleId,
      isActive: body.isActive !== false,
    },
    include: { role: true },
  })
  await logAudit({ userId: user.id, action: 'USER_CREATE', entity: 'User', entityId: u.id, details: `${u.email}`, req })
  return NextResponse.json({ user: u })
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('users.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { id, name, phone, roleId, isActive, password } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const data: any = { name, phone, roleId, isActive }
  if (password) data.passwordHash = hashPassword(password)
  const u = await db.user.update({ where: { id }, data, include: { role: true } })
  await logAudit({ userId: user.id, action: 'USER_UPDATE', entity: 'User', entityId: id, details: u.email, req })
  return NextResponse.json({ user: u })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('users.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (id === user.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  await db.user.delete({ where: { id } })
  await logAudit({ userId: user.id, action: 'USER_DELETE', entity: 'User', entityId: id, req })
  return NextResponse.json({ ok: true })
}
