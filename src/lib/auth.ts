import { NextRequest, NextResponse } from 'next/server'
import { db } from './db'
import * as bcrypt from 'crypto'

export const SESSION_COOKIE = 'pharm_session'
const SECRET = process.env.SESSION_SECRET || 'pharmacy-secret-key-change-in-prod'

// Simple signed-token session: payload (base64url) + HMAC
function sign(payload: string) {
  const sig = bcrypt.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verify(token: string): Record<string, unknown> | null {
  if (!token) return null
  const idx = token.lastIndexOf('.')
  if (idx < 1) return null
  const payload = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const expected = bcrypt.createHmac('sha256', SECRET).update(payload).digest('base64url')
  if (sig !== expected) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (data.exp && Date.now() > data.exp) return null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

export function hashPassword(p: string) {
  const salt = bcrypt.randomBytes(16).toString('hex')
  const hash = bcrypt.pbkdf2Sync(p, salt, 100000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(p: string, stored: string) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const test = bcrypt.pbkdf2Sync(p, salt, 100000, 64, 'sha512').toString('hex')
  return test === hash
}

export function createSession(userId: string) {
  const payload = JSON.stringify({ uid: userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })
  const b64 = Buffer.from(payload).toString('base64url')
  return sign(b64)
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.delete(SESSION_COOKIE)
}

export function parseSession(req: NextRequest): { userId: string; email?: string; roleId?: string } | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  const data = verify(token)
  if (!data) return null
  return { userId: data.uid as string, email: data.email as string, roleId: data.roleId as string }
}

export async function getSessionUser(req: NextRequest) {
  const sess = parseSession(req)
  if (!sess) return null
  const user = await db.user.findUnique({
    where: { id: sess.userId },
    include: { role: true },
  })
  if (!user || !user.isActive) return null
  return user
}

// Permissions
export const PERMISSIONS = {
  // module-level
  'dashboard.view': 'View Dashboard',
  'pos.use': 'Use POS / Billing',
  'inventory.view': 'View Inventory',
  'inventory.edit': 'Edit Medicines & Batches',
  'inventory.delete': 'Delete Medicines',
  'stock.view': 'View Stock Management',
  'expiry.view': 'View Expiry Management',
  'purchases.view': 'View Purchases',
  'purchases.edit': 'Create/Edit Purchases',
  'purchases.return': 'Purchase Returns',
  'suppliers.view': 'View Suppliers',
  'suppliers.edit': 'Edit Suppliers',
  'customers.view': 'View Customers',
  'customers.edit': 'Edit Customers',
  'credit.view': 'View Credit/Udhaar',
  'credit.payment': 'Record Credit Payments',
  'sales.return': 'Sales Returns',
  'expenses.view': 'View Expenses',
  'expenses.edit': 'Add/Edit Expenses',
  'reports.view': 'View Reports',
  'owner.view': 'View Owner Report',
  'notifications.view': 'View Notifications',
  'search.use': 'Use Global Search',
  'audit.view': 'View Audit Log',
  'backup.use': 'Backup/Restore',
  'settings.view': 'View Settings',
  'settings.edit': 'Edit Settings',
  'users.manage': 'Manage Users & Roles',
} as const

export type PermissionKey = keyof typeof PERMISSIONS

export function hasPermission(rolePermissions: string[], key: string): boolean {
  return rolePermissions.includes(key)
}

// Default role permission templates
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: Object.keys(PERMISSIONS),
  MANAGER: [
    'dashboard.view', 'pos.use', 'inventory.view', 'inventory.edit',
    'stock.view', 'expiry.view', 'purchases.view', 'purchases.edit', 'purchases.return',
    'suppliers.view', 'suppliers.edit', 'customers.view', 'customers.edit',
    'credit.view', 'credit.payment', 'sales.return', 'expenses.view', 'expenses.edit',
    'reports.view', 'owner.view', 'notifications.view', 'search.use', 'audit.view',
  ],
  CASHIER: [
    'dashboard.view', 'pos.use', 'inventory.view', 'stock.view',
    'expiry.view', 'customers.view', 'credit.view', 'credit.payment',
    'sales.return', 'notifications.view', 'search.use',
  ],
}
