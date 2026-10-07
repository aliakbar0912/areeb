'use client'

import { useEffect, useState, useMemo, useCallback, Fragment } from 'react'
import { PageHeader, formatPKR, formatDate, formatDateTime, EmptyState, cn } from '@/components/ui-helpers'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command'
import {
  RotateCcw, Search, CheckCircle2, Loader2, AlertCircle,
  ArrowLeft, History, ChevronRight, ChevronDown, Receipt, Package,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

// ============================================================================
// Types
// ============================================================================
interface SaleItem {
  id: string
  medicineId: string
  medicine?: { id: string; name: string }
  batchId?: string | null
  batchNumber?: string | null
  quantity: number // base units
  unitType: string
  unitFactor: number
  unitPrice: number // price per selected unit
  discount: number
  total: number
}

interface SalePayment {
  id: string
  method: string
  amount: number
}

interface SalesReturnItem {
  id: string
  returnId: string
  saleItemId: string
  medicineId: string
  batchId?: string | null
  quantity: number
  unitPrice: number
  total: number
}

interface SalesReturn {
  id: string
  returnNumber: string
  saleId: string
  customerId?: string | null
  customer?: { id: string; name: string } | null
  userId: string
  total: number
  reason?: string | null
  restoreStock: boolean
  createdAt: string
  items: SalesReturnItem[]
}

interface Sale {
  id: string
  invoiceNumber: string
  customerId?: string | null
  customer?: { id: string; name: string } | null
  createdAt: string
  subtotal: number
  discount: number
  tax: number
  total: number
  paidAmount: number
  remainingAmount: number
  paymentStatus: string
  items: SaleItem[]
  payments: SalePayment[]
  returns?: SalesReturn[]
}

// ============================================================================
// Sale Combobox (searchable)
// ============================================================================
function SaleCombobox({
  sales, value, onSelect,
}: { sales: Sale[]; value: string; onSelect: (s: Sale) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = sales.find(s => s.id === value)

  const filtered = useMemo(() => {
    if (!search) return sales
    const q = search.toLowerCase()
    return sales.filter(s =>
      (s.invoiceNumber || '').toLowerCase().includes(q) ||
      (s.customer?.name || '').toLowerCase().includes(q)
    )
  }, [sales, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 justify-between w-full font-normal"
        >
          <span className="truncate text-left">
            {selected
              ? `${selected.invoiceNumber} — ${selected.customer?.name || 'Walk-in'}`
              : <span className="text-muted-foreground">Search invoice # or customer…</span>}
          </span>
          <Search className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search invoice # or customer…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No sale found.</CommandEmpty>
            <CommandGroup>
              {filtered.slice(0, 100).map(s => (
                <CommandItem
                  key={s.id}
                  value={`${s.invoiceNumber} ${s.customer?.name || ''}`}
                  onSelect={() => { onSelect(s); setOpen(false); setSearch('') }}
                  className="text-xs"
                >
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <div>
                      <div className="font-mono font-medium">{s.invoiceNumber}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {s.customer?.name || 'Walk-in'} • {formatDate(s.createdAt)} • {s.items?.length || 0} items
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[10px]">{formatPKR(s.total)}</div>
                      {s.returns && s.returns.length > 0 && (
                        <div className="text-[9px] text-amber-600">{s.returns.length} return(s)</div>
                      )}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// Main View
// ============================================================================
export function SalesReturnsView() {
  const { hasPermission } = useAuth()
  const canReturn = hasPermission('sales.return')

  const [loading, setLoading] = useState(true)
  const [sales, setSales] = useState<Sale[]>([])

  // Step 1 state
  const [selectedSaleId, setSelectedSaleId] = useState<string>('')
  const [sale, setSale] = useState<Sale | null>(null)
  const [loadingSale, setLoadingSale] = useState(false)

  // Step 2 state: map of saleItemId -> { selected, quantity (in base units) }
  const [returnMap, setReturnMap] = useState<Record<string, { selected: boolean; quantity: number }>>({})

  // Step 3 state
  const [reason, setReason] = useState('')
  const [restoreStock, setRestoreStock] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Expanded return row in recent table
  const [expandedReturnId, setExpandedReturnId] = useState<string | null>(null)

  const fetchSales = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/sales?limit=100')
      const d = await r.json()
      setSales(d.sales || [])
    } catch {
      toast.error('Failed to load sales')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSales() }, [fetchSales])

  const handleSelectSaleId = useCallback(async (id: string) => {
    setSelectedSaleId(id)
    setSale(null)
    setLoadingSale(true)
    setReturnMap({})
    setReason('')
    setRestoreStock(true)
    try {
      const r = await fetch(`/api/sales/${id}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to load sale')
      setSale(d.sale)
      // init return map with all items deselected and full original qty
      const init: Record<string, { selected: boolean; quantity: number }> = {}
      for (const it of d.sale.items || []) {
        init[it.id] = { selected: false, quantity: it.quantity }
      }
      setReturnMap(init)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load sale')
      setSelectedSaleId('')
    } finally {
      setLoadingSale(false)
    }
  }, [])

  const toggleItem = (itemId: string, checked: boolean) => {
    setReturnMap(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { selected: false, quantity: 0 }), selected: checked },
    }))
  }

  const setItemQty = (itemId: string, qty: number) => {
    const max = sale?.items?.find(i => i.id === itemId)?.quantity ?? 0
    const v = Math.max(0, Math.min(qty, max))
    setReturnMap(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { selected: false, quantity: 0 }), quantity: v },
    }))
  }

  const selectedItems = useMemo(() => {
    if (!sale) return []
    return (sale.items || []).filter(it => returnMap[it.id]?.selected)
  }, [sale, returnMap])

  // Line total = unitPrice * (qty / unitFactor) — matches API calculation
  const lineTotal = (it: SaleItem, qty: number) => {
    const factor = Number(it.unitFactor) || 1
    return (Number(it.unitPrice) || 0) * (qty / factor)
  }

  const returnTotal = useMemo(() => {
    return selectedItems.reduce((s, it) => {
      const qty = returnMap[it.id]?.quantity || 0
      return s + lineTotal(it, qty)
    }, 0)
  }, [selectedItems, returnMap])

  const resetForm = () => {
    setSelectedSaleId('')
    setSale(null)
    setReturnMap({})
    setReason('')
    setRestoreStock(true)
  }

  const submitReturn = async () => {
    if (!sale) return
    const items = selectedItems
      .map(it => ({ saleItemId: it.id, quantity: Number(returnMap[it.id]?.quantity) || 0 }))
      .filter(x => x.quantity > 0)
    if (items.length === 0) { toast.error('Select at least one item with quantity > 0'); return }
    setSubmitting(true)
    try {
      const r = await fetch(`/api/sales/${sale.id}/return`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, reason: reason || undefined, restoreStock }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to create return')
      toast.success(`Return ${d.saleReturn?.returnNumber || ''} created — ${formatPKR(d.saleReturn?.total || 0)}`)
      resetForm()
      await fetchSales()
    } catch (e: any) {
      toast.error(e.message || 'Failed to create return')
    } finally {
      setSubmitting(false)
    }
  }

  // Recent returns: aggregate from sales list (now includes returns[])
  const recentReturns = useMemo(() => {
    const list: Array<{ ret: SalesReturn; sale: Sale }> = []
    for (const s of sales) {
      for (const rt of s.returns || []) {
        list.push({
          ret: { ...rt, customer: s.customer, saleId: s.id },
          sale: s,
        })
      }
    }
    return list.sort((a, b) => new Date(b.ret.createdAt).getTime() - new Date(a.ret.createdAt).getTime())
  }, [sales])

  if (loading) {
    return (
      <div>
        <PageHeader title="Sales Returns" subtitle="Process customer returns with stock restoration" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Sales Returns"
        subtitle="Process customer returns with stock restoration"
      />

      {!canReturn ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={AlertCircle}
              title="Permission required"
              description="You do not have permission to create sales returns (sales.return)."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 3-step wizard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
            <Card className={selectedSaleId ? 'border-muted' : 'border-primary'}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
                  <Label className="text-xs font-semibold">Find Invoice</Label>
                </div>
                <SaleCombobox
                  sales={sales}
                  value={selectedSaleId}
                  onSelect={s => handleSelectSaleId(s.id)}
                />
              </CardContent>
            </Card>

            <Card className={!selectedSaleId ? 'opacity-50' : ''}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold', selectedSaleId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>2</div>
                  <Label className="text-xs font-semibold">Select Items & Qty</Label>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedSaleId
                    ? `${selectedItems.length} item(s) selected • Total: ${formatPKR(returnTotal)}`
                    : 'Select an invoice to begin'}
                </div>
              </CardContent>
            </Card>

            <Card className={!selectedSaleId ? 'opacity-50' : ''}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold', selectedSaleId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>3</div>
                  <Label className="text-xs font-semibold">Reason & Submit</Label>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedSaleId
                    ? `Restore stock: ${restoreStock ? 'Yes' : 'No'}`
                    : 'Complete steps 1 & 2 first'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main panel */}
          {!selectedSaleId ? (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  icon={RotateCcw}
                  title="Select a sales invoice"
                  description="Search by invoice # or customer name above to start a return."
                />
              </CardContent>
            </Card>
          ) : loadingSale ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </CardContent>
            </Card>
          ) : sale ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Items table - steps 2 */}
              <Card className="lg:col-span-2">
                <CardContent className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <div className="text-sm font-semibold font-mono">{sale.invoiceNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {sale.customer?.name || 'Walk-in customer'} • {formatDateTime(sale.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {sale.paymentStatus === 'PAID' ? 'PAID' : sale.paymentStatus === 'PARTIAL' ? 'PARTIAL' : 'CREDIT'}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-xs">
                        {selectedItems.length} of {sale.items?.length || 0} selected
                      </Badge>
                    </div>
                  </div>

                  <div className="border rounded-md max-h-[420px] overflow-y-auto scroll-area">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="w-8" />
                          <TableHead>Medicine</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead className="text-right">Sold</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Return Qty</TableHead>
                          <TableHead className="text-right">Line Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(sale.items || []).map(it => {
                          const r = returnMap[it.id] || { selected: false, quantity: 0 }
                          const lt = lineTotal(it, r.quantity)
                          const unitLabel = it.unitType && it.unitFactor > 1
                            ? `${it.unitType} (×${it.unitFactor})`
                            : it.unitType || ''
                          return (
                            <TableRow key={it.id} className={r.selected ? 'bg-amber-50 dark:bg-amber-900/10' : ''}>
                              <TableCell>
                                <Checkbox
                                  checked={r.selected}
                                  onCheckedChange={(c) => toggleItem(it.id, !!c)}
                                />
                              </TableCell>
                              <TableCell className="text-xs">
                                <div className="font-medium">{it.medicine?.name || '—'}</div>
                                {unitLabel && (
                                  <div className="text-[10px] text-muted-foreground">{unitLabel}</div>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {it.batchNumber || '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {it.quantity}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatPKR(it.unitPrice)}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  value={r.quantity}
                                  disabled={!r.selected}
                                  onChange={e => setItemQty(it.id, Number(e.target.value) || 0)}
                                  className="h-8 text-xs w-20 text-right ml-auto"
                                  min={0}
                                  max={it.quantity}
                                  step="1"
                                />
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs font-semibold">
                                {formatPKR(lt)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Quantity is in base units. Line total = unit price × (qty / unit factor).</span>
                    <span>Sale total: <span className="font-mono font-semibold text-foreground">{formatPKR(sale.total)}</span></span>
                  </div>
                </CardContent>
              </Card>

              {/* Reason + submit panel - step 3 */}
              <Card>
                <CardContent className="p-3 space-y-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Return Reason</Label>
                    <Textarea
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="e.g. Customer changed mind, wrong item, damaged pack, expired stock"
                      className="min-h-[80px] text-sm"
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="text-sm font-medium">Restore Stock</div>
                      <div className="text-xs text-muted-foreground">
                        Increment inventory for returned items
                      </div>
                    </div>
                    <Switch
                      checked={restoreStock}
                      onCheckedChange={setRestoreStock}
                    />
                  </div>

                  <Separator />

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Items selected</span><span>{selectedItems.length}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base">
                      <span>Return Total</span>
                      <span className="font-mono text-primary">{formatPKR(returnTotal)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={resetForm}
                      disabled={submitting}
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" /> Reset
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={submitReturn}
                      disabled={submitting || selectedItems.length === 0}
                    >
                      {submitting
                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Submit Return
                    </Button>
                  </div>

                  {sale.returns && sale.returns.length > 0 && (
                    <div className="pt-2 border-t">
                      <div className="text-xs text-muted-foreground mb-1">Previous returns on this invoice</div>
                      <div className="space-y-1 max-h-[120px] overflow-y-auto scroll-area">
                        {sale.returns.map(rt => (
                          <div key={rt.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/40">
                            <div>
                              <div className="font-mono font-medium">{rt.returnNumber}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatDate(rt.createdAt)} {rt.restoreStock && '• Stock restored'}
                              </div>
                            </div>
                            <span className="font-mono">{formatPKR(rt.total)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Recent returns */}
          <Card className="mt-4">
            <CardContent className="p-0">
              <div className="p-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  <span className="text-sm font-semibold">Recent Sales Returns</span>
                </div>
                <Badge variant="outline" className="font-mono text-xs">{recentReturns.length} total</Badge>
              </div>
              {recentReturns.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No sales returns yet"
                  description="Returns you create will appear here."
                />
              ) : (
                <div className="max-h-[420px] overflow-y-auto scroll-area">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead>Date</TableHead>
                        <TableHead>Return #</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentReturns.map(({ ret, sale: s }) => {
                        const expanded = expandedReturnId === ret.id
                        return (
                          <Fragment key={ret.id}>
                            <TableRow
                              className={cn('cursor-pointer hover:bg-muted/40', expanded && 'bg-muted/30')}
                              onClick={() => setExpandedReturnId(expanded ? null : ret.id)}
                            >
                              <TableCell className="text-muted-foreground">
                                {expanded
                                  ? <ChevronDown className="h-3.5 w-3.5" />
                                  : <ChevronRight className="h-3.5 w-3.5" />}
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{formatDateTime(ret.createdAt)}</TableCell>
                              <TableCell className="font-mono text-xs font-medium">{ret.returnNumber}</TableCell>
                              <TableCell className="font-mono text-xs">{s.invoiceNumber}</TableCell>
                              <TableCell className="text-sm">{s.customer?.name || 'Walk-in'}</TableCell>
                              <TableCell className="text-right font-mono text-xs font-semibold">{formatPKR(ret.total)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{ret.reason || '—'}</TableCell>
                              <TableCell>
                                {ret.restoreStock
                                  ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900">Restored</Badge>
                                  : <Badge variant="secondary">Not restored</Badge>}
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { resetForm(); handleSelectSaleId(s.id) }}
                                  title="Open invoice"
                                >
                                  <Receipt className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                            {expanded && (
                              <TableRow className="bg-muted/20 hover:bg-muted/20">
                                <TableCell colSpan={9} className="p-3">
                                  <div className="text-xs font-semibold mb-2 flex items-center gap-2">
                                    <Package className="h-3.5 w-3.5" />
                                    Returned Items ({ret.items?.length || 0})
                                  </div>
                                  <div className="rounded border overflow-hidden">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Medicine ID</TableHead>
                                          <TableHead>Batch ID</TableHead>
                                          <TableHead className="text-right">Qty</TableHead>
                                          <TableHead className="text-right">Unit Price</TableHead>
                                          <TableHead className="text-right">Line Total</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {(ret.items || []).map(ri => {
                                          const medName = s.items?.find(si => si.id === ri.saleItemId)?.medicine?.name
                                            || s.items?.find(si => si.id === ri.saleItemId)?.medicineId
                                            || ri.medicineId
                                          return (
                                            <TableRow key={ri.id}>
                                              <TableCell className="text-xs font-medium">{medName}</TableCell>
                                              <TableCell className="text-xs font-mono text-muted-foreground">
                                                {s.items?.find(si => si.id === ri.saleItemId)?.batchNumber || '—'}
                                              </TableCell>
                                              <TableCell className="text-right font-mono text-xs">{ri.quantity}</TableCell>
                                              <TableCell className="text-right font-mono text-xs">{formatPKR(ri.unitPrice)}</TableCell>
                                              <TableCell className="text-right font-mono text-xs font-semibold">{formatPKR(ri.total)}</TableCell>
                                            </TableRow>
                                          )
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
