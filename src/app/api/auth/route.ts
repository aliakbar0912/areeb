import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, verifyPassword, createSession, setSessionCookie, clearSessionCookie, parseSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { email, password } = body || {}
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { role: true },
  })
  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }
  const token = createSession(user.id)
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await logAudit({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, req })
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role.name, permissions: user.role.permissions },
  })
  setSessionCookie(res, token)
  return res
}

export async function DELETE(req: NextRequest) {
  const sess = parseSession(req)
  if (sess) {
    await logAudit({ userId: sess.userId, action: 'LOGOUT', req })
  }
  const res = NextResponse.json({ ok: true })
  clearSessionCookie(res)
  return res
}
