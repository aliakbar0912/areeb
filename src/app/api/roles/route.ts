import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('users.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const roles = await db.role.findMany({ include: { _count: { select: { users: true } } } })
  return NextResponse.json({
    roles: roles.map(r => ({
      id: r.id, name: r.name, description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions,
      usersCount: r._count.users,
    })),
    available: PERMISSIONS,
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('users.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const role = await db.role.create({
    data: {
      name: body.name,
      description: body.description || null,
      permissions: body.permissions || [],
    },
  })
  await logAudit({ userId: user.id, action: 'ROLE_CREATE', entity: 'Role', entityId: role.id, details: role.name, req })
  return NextResponse.json({ role })
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('users.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { id, name, description, permissions } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const role = await db.role.update({
    where: { id },
    data: {
      name: name ?? undefined,
      description: description ?? undefined,
      permissions: permissions ?? undefined,
    },
  })
  await logAudit({ userId: user.id, action: 'ROLE_UPDATE', entity: 'Role', entityId: id, details: role.name, req })
  return NextResponse.json({ role })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('users.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const role = await db.role.findUnique({ where: { id } })
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role.isSystem) return NextResponse.json({ error: 'Cannot delete system role' }, { status: 400 })
  await db.role.delete({ where: { id } })
  await logAudit({ userId: user.id, action: 'ROLE_DELETE', entity: 'Role', entityId: id, req })
  return NextResponse.json({ ok: true })
}

export { DEFAULT_ROLE_PERMISSIONS }
