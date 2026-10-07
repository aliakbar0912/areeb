import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { setManySettings, getSettings, DEFAULT_SETTINGS } from '@/lib/settings'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('settings.view')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const stored = await getSettings()
  const merged = { ...DEFAULT_SETTINGS, ...stored }
  return NextResponse.json({ settings: merged })
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('settings.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  // body is object of key->value strings
  await setManySettings(body)
  await logAudit({ userId: user.id, action: 'SETTINGS_UPDATE', entity: 'Settings', details: `${Object.keys(body).length} keys`, req })
  return NextResponse.json({ ok: true })
}
