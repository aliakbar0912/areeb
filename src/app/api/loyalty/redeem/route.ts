import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { getSettingNumber } from '@/lib/settings'

// POST /api/loyalty/redeem — redeem points for a discount on a sale
// Body: { customerId, points, saleId? }
// Returns: { redeemed, discountAmount, transaction }
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('customers.edit')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { customerId, points, saleId } = body || {}
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })
  const pts = Number(points)
  if (!pts || pts <= 0) return NextResponse.json({ error: 'points must be positive' }, { status: 400 })

  // Check minimum redeem points
  const minRedeem = await getSettingNumber('loyalty.minRedeemPoints', 50)
  if (pts < minRedeem) {
    return NextResponse.json({ error: `Minimum ${minRedeem} points required to redeem` }, { status: 400 })
  }

  // Check customer has enough points
  const existing = await db.loyaltyTransaction.aggregate({
    _sum: { points: true },
    where: { customerId },
  })
  const current = existing._sum.points || 0
  if (current < pts) {
    return NextResponse.json({ error: `Insufficient points. Customer has ${current}, tried to redeem ${pts}` }, { status: 400 })
  }

  // Calculate discount amount (1 point = Rs X, configurable)
  const redeemRate = await getSettingNumber('loyalty.redeemRate', 1)
  const discountAmount = pts * redeemRate

  // Create redemption transaction
  const txn = await db.loyaltyTransaction.create({
    data: {
      customerId,
      type: 'REDEEM',
      points: -pts,
      description: `Redeemed ${pts} points for Rs ${discountAmount} discount${saleId ? ` on sale` : ''}`,
      refType: saleId ? 'Sale' : 'Manual',
      refId: saleId || null,
      userId: user.id,
    },
  })

  await logAudit({
    userId: user.id,
    action: 'LOYALTY_REDEEM',
    entity: 'LoyaltyTransaction',
    entityId: txn.id,
    details: `Customer ${customerId}: redeemed ${pts} pts for Rs ${discountAmount}`,
    req,
  })

  return NextResponse.json({
    redeemed: pts,
    discountAmount,
    transaction: txn,
    remainingPoints: current - pts,
  })
}

// GET /api/loyalty/redeem?customerId=ID — preview redemption value
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const customerId = url.searchParams.get('customerId')
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

  const [existing, redeemRate, minRedeem] = await Promise.all([
    db.loyaltyTransaction.aggregate({ _sum: { points: true }, where: { customerId } }),
    getSettingNumber('loyalty.redeemRate', 1),
    getSettingNumber('loyalty.minRedeemPoints', 50),
  ])
  const current = existing._sum.points || 0
  const maxRedeemable = Math.max(0, current)
  const maxDiscount = maxRedeemable * redeemRate

  return NextResponse.json({
    currentPoints: current,
    redeemRate,
    minRedeemPoints: minRedeem,
    maxRedeemable,
    maxDiscount,
    canRedeem: current >= minRedeem,
  })
}
