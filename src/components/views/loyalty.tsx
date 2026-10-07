'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader, StatCard, formatPKR, formatCompactPKR, formatDateTime, EmptyState } from '@/components/ui-helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Award, Plus, Minus, TrendingUp, Loader2, Sparkles, Crown, Medal, Star, Trophy, ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav-context'

interface LoyaltyCustomer {
  id: string
  name: string
  phone?: string | null
  points: number
  tier: { name: string; color: string; nextTierPoints: number | null }
}

interface LoyaltyTxn {
  id: string
  type: string
  points: number
  description: string | null
  refType: string | null
  refId: string | null
  createdAt: string
}

const TIER_ICONS: Record<string, any> = {
  Platinum: Crown,
  Gold: Trophy,
  Silver: Medal,
  Bronze: Star,
  None: Award,
}

export function LoyaltyView() {
  const { hasPermission } = useAuth()
  const { navigate } = useNav()
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustSaving, setAdjustSaving] = useState(false)
  const [adjustForm, setAdjustForm] = useState({ customerId: '', type: 'EARN', points: 0, description: '' })
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyCustomer, setHistoryCustomer] = useState<LoyaltyCustomer | null>(null)
  const [historyTxns, setHistoryTxns] = useState<LoyaltyTxn[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/loyalty')
      if (r.ok) {
        const d = await r.json()
        setCustomers(d.customers || [])
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  )

  const totalPoints = customers.reduce((s, c) => s + Math.max(0, c.points), 0)
  const activeCustomers = customers.filter(c => c.points > 0).length
  const platinumCount = customers.filter(c => c.tier.name === 'Platinum').length
  const goldCount = customers.filter(c => c.tier.name === 'Gold').length

  const openHistory = async (customer: LoyaltyCustomer) => {
    setHistoryCustomer(customer)
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const r = await fetch(`/api/loyalty?customerId=${customer.id}`)
      if (r.ok) {
        const d = await r.json()
        setHistoryTxns(d.transactions || [])
      }
    } catch (e) {
      // ignore
    } finally {
      setHistoryLoading(false)
    }
  }

  const openAdjust = (customer: LoyaltyCustomer) => {
    setAdjustForm({ customerId: customer.id, type: 'EARN', points: 0, description: '' })
    setAdjustOpen(true)
  }

  const handleAdjustSubmit = async () => {
    if (!adjustForm.points || adjustForm.points === 0) {
      toast.error('Points must be non-zero')
      return
    }
    setAdjustSaving(true)
    try {
      const r = await fetch('/api/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: adjustForm.customerId,
          type: adjustForm.type,
          points: Math.abs(adjustForm.points),
          description: adjustForm.description || `${adjustForm.type} ${Math.abs(adjustForm.points)} points`,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to adjust points')
      toast.success(`${adjustForm.type === 'EARN' ? 'Added' : adjustForm.type === 'REDEEM' ? 'Redeemed' : 'Adjusted'} ${Math.abs(adjustForm.points)} points`)
      setAdjustOpen(false)
      await fetchData()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setAdjustSaving(false)
    }
  }

  if (!hasPermission('customers.view')) {
    return <PageHeader title="Loyalty Program" subtitle="Access denied" />
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Loyalty Program" subtitle="Customer rewards & points management" />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Loyalty Program"
        subtitle="Customer rewards — points earned automatically on every purchase (1 pt per Rs 100 spent)"
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('customers')}>
            View All Customers →
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Active Members" value={activeCustomers} icon={Award} tone="info" hint="With points earned" />
        <StatCard label="Total Points Issued" value={totalPoints.toLocaleString()} icon={Sparkles} tone="success" hint={`Equivalent to ${formatPKR(totalPoints)} redeemable`} />
        <StatCard label="Gold Members" value={goldCount} icon={Trophy} tone="warning" hint="2,000+ points" />
        <StatCard label="Platinum Members" value={platinumCount} icon={Crown} tone="default" hint="5,000+ points" />
      </div>

      {/* Tier legend */}
      <Card className="mb-4 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" /> Loyalty Tiers
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { name: 'Bronze', icon: Star, range: '1 - 499', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
              { name: 'Silver', icon: Medal, range: '500 - 1,999', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300' },
              { name: 'Gold', icon: Trophy, range: '2,000 - 4,999', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
              { name: 'Platinum', icon: Crown, range: '5,000+', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
            ].map(t => {
              const Icon = t.icon
              return (
                <div key={t.name} className="flex items-center gap-2 p-2 rounded-lg border">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{t.name}</div>
                    <div className="text-[10px] text-muted-foreground">{t.range} pts</div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="mb-3">
        <Input
          placeholder="Search customers by name or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Customers table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Loyalty Members ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Award}
              title={search ? 'No matching customers' : 'No loyalty members yet'}
              description={search ? 'Try a different search' : 'Customers earn points automatically when they make a purchase. Sell to a customer to start their loyalty journey.'}
            />
          ) : (
            <div className="overflow-x-auto scroll-area">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Next Tier</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => {
                    const TierIcon = TIER_ICONS[c.tier.name] || Award
                    const progress = c.tier.nextTierPoints != null
                      ? Math.min(100, (c.points / c.tier.nextTierPoints) * 100)
                      : 100
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.phone || '—'}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">{c.points.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge className={`${c.tier.color} border`}>
                            <TierIcon className="h-3 w-3 mr-1" />
                            {c.tier.name}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {c.tier.nextTierPoints != null ? (
                            <div className="space-y-1">
                              <div className="text-[10px] text-muted-foreground">
                                {(c.tier.nextTierPoints - c.points).toLocaleString()} pts to next tier
                              </div>
                              <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-primary transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">Top tier reached</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openHistory(c)} title="View history">
                              History
                            </Button>
                            {hasPermission('customers.edit') && (
                              <Button size="sm" variant="outline" onClick={() => openAdjust(c)} title="Adjust points">
                                <Plus className="h-3 w-3 mr-1" /> Adjust
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjust Points Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Award className="h-4 w-4" />
              </div>
              Adjust Loyalty Points
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 p-2.5 text-xs text-sky-800 dark:text-sky-200">
              Use EARN to add points (rewards), REDEEM to subtract (discount given to customer), or ADJUST for corrections.
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Action</Label>
              <Select value={adjustForm.type} onValueChange={v => setAdjustForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EARN">EARN — Add points (reward)</SelectItem>
                  <SelectItem value="REDEEM">REDEEM — Subtract points (discount given)</SelectItem>
                  <SelectItem value="ADJUST">ADJUST — Manual correction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-points" className="text-xs">Points (absolute value)</Label>
              <Input
                id="adj-points"
                type="number" min="1"
                value={adjustForm.points || ''}
                onChange={e => setAdjustForm(f => ({ ...f, points: Number(e.target.value) || 0 }))}
                placeholder="e.g. 100"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-desc" className="text-xs">Description (optional)</Label>
              <Input
                id="adj-desc"
                value={adjustForm.description}
                onChange={e => setAdjustForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Bonus points for referral"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button onClick={handleAdjustSubmit} disabled={adjustSaving}>
              {adjustSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Award className="h-4 w-4 mr-2" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <TrendingUp className="h-4 w-4" />
              </div>
              {historyCustomer?.name} — {historyCustomer?.points.toLocaleString() || 0} pts
              {historyCustomer && (
                <Badge className={`${historyCustomer.tier.color} border ml-2`}>
                  {historyCustomer.tier.name}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : historyTxns.length === 0 ? (
            <EmptyState icon={Award} title="No transactions yet" description="This customer has no loyalty point activity." />
          ) : (
            <div className="overflow-x-auto scroll-area max-h-[60vh]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyTxns.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={t.type === 'EARN' ? 'default' : t.type === 'REDEEM' ? 'secondary' : 'outline'}
                          className={t.type === 'EARN' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : ''}
                        >
                          {t.type}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-mono font-bold ${t.points > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {t.points > 0 ? '+' : ''}{t.points}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.description || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
