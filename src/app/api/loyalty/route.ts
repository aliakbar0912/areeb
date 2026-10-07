import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { getSettingNumber } from '@/lib/settings'

// GET /api/loyalty?customerId=ID — returns loyalty points summary for a customer
// GET /api/loyalty — returns all customers with their loyalty points
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const customerId = url.searchParams.get('customerId')

  if (customerId) {
    // Return specific customer's loyalty summary + transactions
    const [customer, txns] = await Promise.all([
      db.customer.findUnique({ where: { id: customerId } }),
      db.loyaltyTransaction.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    const points = txns.reduce((s, t) => s + t.points, 0)
    return NextResponse.json({
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      points,
      transactions: txns,
    })
  }

  // Return all customers with loyalty points
  const customers = await db.customer.findMany({
    include: { loyaltyTxns: { select: { points: true } } },
    orderBy: { name: 'asc' },
  })
  const result = customers.map(c => {
    const points = c.loyaltyTxns.reduce((s, t) => s + t.points, 0)
    return {
      id: c.id, name: c.name, phone: c.phone,
      points,
      tier: getLoyaltyTier(points),
    }
  }).filter(c => c.points !== 0)
  return NextResponse.json({ customers: result })
}

// POST /api/loyalty — add manual adjustment (earn or redeem)
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('customers.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { customerId, type, points, description, refType, refId } = body || {}
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })
  if (!['EARN', 'REDEEM', 'ADJUST'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type. Must be EARN, REDEEM, or ADJUST' }, { status: 400 })
  }
  const pts = Number(points)
  if (!pts || pts === 0) return NextResponse.json({ error: 'points must be non-zero' }, { status: 400 })

  // For REDEEM, points should be negative; for EARN, positive
  let signedPoints = pts
  if (type === 'REDEEM' && pts > 0) signedPoints = -pts
  if (type === 'EARN' && pts < 0) signedPoints = -pts

  // Check customer has enough points for redemption
  if (type === 'REDEEM') {
    const existing = await db.loyaltyTransaction.aggregate({
      _sum: { points: true },
      where: { customerId },
    })
    const current = existing._sum.points || 0
    if (current + signedPoints < 0) {
      return NextResponse.json({ error: `Insufficient points. Customer has ${current}, tried to redeem ${pts}` }, { status: 400 })
    }
  }

  const txn = await db.loyaltyTransaction.create({
    data: {
      customerId,
      type,
      points: signedPoints,
      description: description || `${type} ${Math.abs(pts)} points`,
      refType: refType || 'Manual',
      refId: refId || null,
      userId: user.id,
    },
  })

  await logAudit({ userId: user.id, action: `LOYALTY_${type}`, entity: 'LoyaltyTransaction', entityId: txn.id, details: `Customer ${customerId}: ${signedPoints > 0 ? '+' : ''}${signedPoints} pts`, req })
  return NextResponse.json({ transaction: txn })
}

// Loyalty tier calculation
export function getLoyaltyTier(points: number): { name: string; color: string; nextTierPoints: number | null } {
  if (points >= 5000) return { name: 'Platinum', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', nextTierPoints: null }
  if (points >= 2000) return { name: 'Gold', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', nextTierPoints: 5000 }
  if (points >= 500) return { name: 'Silver', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300', nextTierPoints: 2000 }
  if (points > 0) return { name: 'Bronze', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', nextTierPoints: 500 }
  return { name: 'None', color: 'bg-muted text-muted-foreground', nextTierPoints: 0 }
}

// Settings for loyalty program (configurable via Settings)
export const LOYALTY_DEFAULTS = {
  'loyalty.enabled': 'true',
  'loyalty.pointsPerRupee': '1', // 1 point per Rs 100 spent by default
  'loyalty.rupeesPerPoint': '100', // earn 1 point per Rs 100
  'loyalty.redeemRate': '1', // 1 point = Rs 1 discount
  'loyalty.minRedeemPoints': '50', // minimum 50 points to redeem
}
