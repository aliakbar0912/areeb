'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader, formatPKR, formatCompactPKR, formatQty, EmptyState } from '@/components/ui-helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ClipboardList, Trash2, RefreshCw, ShoppingCart, Loader2, CheckCircle2, AlertCircle, Package,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

interface DraftItem {
  id: string
  medicineId: string
  medicineName: string
  genericName?: string | null
  manufacturer?: string | null
  currentStock: number
  minStock: number
  avgWeeklySales: number
  suggestedQty: number
  approvedQty: number
  supplierId?: string | null
  estimatedCost: number
  status: string
  createdAt: string
}

interface Supplier {
  id: string
  name: string
  company?: string | null
}

export function DraftPOsView() {
  const { hasPermission } = useAuth()
  const [items, setItems] = useState<DraftItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [convertSupplier, setConvertSupplier] = useState<string>('')
  const [convertItems, setConvertItems] = useState<Record<string, { batchNumber: string; expiryDate: string; purchasePrice: number; salePrice: number; approvedQty: number; selected: boolean }>>({})

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [d, s] = await Promise.all([
        fetch('/api/draft-pos').then(r => r.json()),
        fetch('/api/suppliers').then(r => r.json()),
      ])
      setItems(d.items || [])
      setSuppliers(s.suppliers || [])
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const pendingItems = items.filter(i => i.status === 'PENDING')
  const convertedItems = items.filter(i => i.status === 'CONVERTED')
  const totalEstimated = pendingItems.reduce((s, i) => s + i.estimatedCost, 0)

  const handleUpdateQty = async (id: string, approvedQty: number) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, approvedQty } : i))
    await fetch('/api/draft-pos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id, approvedQty }),
    })
  }

  const handleUpdateSupplier = async (id: string, supplierId: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, supplierId } : i))
    await fetch('/api/draft-pos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id, supplierId }),
    })
  }

  const handleRemove = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    await fetch('/api/draft-pos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', id }),
    })
    toast.success('Item removed from draft')
  }

  const handleClearAll = async () => {
    setClearOpen(false)
    await fetch('/api/draft-pos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' }),
    })
    setItems([])
    toast.success('All draft POs cleared')
  }

  const openConvertDialog = () => {
    if (pendingItems.length === 0) {
      toast.error('No pending items to convert')
      return
    }
    // initialize convert state for each item
    const init: Record<string, any> = {}
    for (const it of pendingItems) {
      const defaultPrice = it.approvedQty > 0 ? it.estimatedCost / it.approvedQty : 0
      init[it.id] = {
        batchNumber: `BATCH-${it.medicineName.slice(0, 3).toUpperCase()}-${new Date().getFullYear()}`,
        expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
        purchasePrice: Number(defaultPrice.toFixed(2)),
        salePrice: 0,
        approvedQty: it.approvedQty,
        selected: true,
      }
    }
    setConvertItems(init)
    setConvertSupplier(suppliers[0]?.id || '')
    setConvertOpen(true)
  }

  const handleConvert = async () => {
    if (!convertSupplier) {
      toast.error('Please select a supplier')
      return
    }
    const selected = Object.entries(convertItems).filter(([_, v]) => v.selected)
    if (selected.length === 0) {
      toast.error('Select at least one item to convert')
      return
    }
    setConverting(true)
    try {
      const items = selected.map(([id, v]) => ({
        id,
        approvedQty: v.approvedQty,
        batchNumber: v.batchNumber,
        expiryDate: v.expiryDate,
        purchasePrice: v.purchasePrice,
        salePrice: v.salePrice,
      }))
      const r = await fetch('/api/draft-pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'convert', items, supplierId: convertSupplier }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Conversion failed')
      toast.success(`Purchase ${d.invoiceNumber} created — ${formatPKR(d.total)}`, {
        description: `${items.length} item(s) converted, inventory updated`,
      })
      setConvertOpen(false)
      await fetchAll()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setConverting(false)
    }
  }

  if (!hasPermission('purchases.edit') && !hasPermission('inventory.edit')) {
    return (
      <PageHeader title="Draft Purchase Orders" subtitle="Access denied" />
    )
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Draft Purchase Orders" subtitle="Manage & convert reorder suggestions to purchases" />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Draft Purchase Orders"
        subtitle={`${pendingItems.length} pending • ${convertedItems.length} converted • Total estimated: ${formatPKR(totalEstimated)}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={fetchAll}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
            {pendingItems.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => setClearOpen(true)} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear All
                </Button>
                <Button size="sm" onClick={openConvertDialog} className="bg-emerald-600 hover:bg-emerald-700">
                  <ShoppingCart className="h-3.5 w-3.5 mr-1.5" /> Convert to Purchase ({pendingItems.length})
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pending Items</div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{pendingItems.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Estimated Cost</div>
          <div className="text-xl font-bold text-primary">{formatCompactPKR(totalEstimated)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{formatPKR(totalEstimated)}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Converted to Purchases</div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{convertedItems.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Available Suppliers</div>
          <div className="text-xl font-bold text-foreground">{suppliers.length}</div>
        </div>
      </div>

      {/* Pending items table */}
      <Card className="shadow-sm mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Pending Reorder Items ({pendingItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pendingItems.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No pending draft items"
              description="Use the 'Reorder All' button on the Dashboard to add low-stock medicines to draft POs, then convert them here."
            />
          ) : (
            <div className="overflow-x-auto scroll-area">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Suggested</TableHead>
                    <TableHead className="text-right">Approve Qty</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Est. Cost</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingItems.map(it => (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{it.medicineName}</div>
                        <div className="text-xs text-muted-foreground">
                          {it.genericName && <span>{it.genericName}</span>}
                          {it.manufacturer && <span> • {it.manufacturer}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">{formatQty(it.currentStock)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatQty(it.minStock)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-amber-600 dark:text-amber-400">{formatQty(it.suggestedQty)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={it.approvedQty}
                          onChange={e => handleUpdateQty(it.id, Number(e.target.value) || 0)}
                          className="w-20 h-8 text-right text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={it.supplierId || ''}
                          onValueChange={v => handleUpdateSupplier(it.id, v)}
                        >
                          <SelectTrigger className="h-8 text-xs w-40">
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {suppliers.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{formatPKR(it.estimatedCost)}</TableCell>
                      <TableCell className="text-center">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleRemove(it.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Converted history */}
      {convertedItems.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Converted to Purchases ({convertedItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto scroll-area max-h-72">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead className="text-right">Approved Qty</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {convertedItems.map(it => (
                    <TableRow key={it.id} className="opacity-70">
                      <TableCell className="font-medium text-sm">{it.medicineName}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatQty(it.approvedQty)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatPKR(it.estimatedCost)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="default" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Converted</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(it.createdAt).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Convert to Purchase Dialog */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" /> Convert Draft PO to Purchase
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Supplier select */}
            <div className="flex items-center gap-3">
              <Label className="text-sm shrink-0">Supplier:</Label>
              <Select value={convertSupplier} onValueChange={setConvertSupplier}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}{s.company ? ` (${s.company})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Review batch details for each item. The conversion will create a real purchase invoice, increase inventory stock by the approved quantity, and record a supplier payable. This action cannot be undone.</span>
            </div>

            {/* Items table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="sticky top-0 bg-muted">
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Medicine</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Batch #</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">P. Price</TableHead>
                    <TableHead className="text-right">S. Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingItems.map(it => {
                    const ci = convertItems[it.id]
                    if (!ci) return null
                    const lineTotal = ci.approvedQty * ci.purchasePrice
                    return (
                      <TableRow key={it.id} className={!ci.selected ? 'opacity-50' : ''}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={ci.selected}
                            onChange={e => setConvertItems(prev => ({ ...prev, [it.id]: { ...prev[it.id], selected: e.target.checked } }))}
                            className="h-4 w-4 rounded"
                          />
                        </TableCell>
                        <TableCell className="font-medium text-sm">{it.medicineName}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={ci.approvedQty}
                            onChange={e => setConvertItems(prev => ({ ...prev, [it.id]: { ...prev[it.id], approvedQty: Number(e.target.value) || 0 } }))}
                            className="w-16 h-8 text-right text-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={ci.batchNumber}
                            onChange={e => setConvertItems(prev => ({ ...prev, [it.id]: { ...prev[it.id], batchNumber: e.target.value } }))}
                            className="h-8 text-xs w-32"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={ci.expiryDate}
                            onChange={e => setConvertItems(prev => ({ ...prev, [it.id]: { ...prev[it.id], expiryDate: e.target.value } }))}
                            className="h-8 text-xs w-32"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="any"
                            value={ci.purchasePrice}
                            onChange={e => setConvertItems(prev => ({ ...prev, [it.id]: { ...prev[it.id], purchasePrice: Number(e.target.value) || 0 } }))}
                            className="w-20 h-8 text-right text-sm"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="any"
                            value={ci.salePrice}
                            onChange={e => setConvertItems(prev => ({ ...prev, [it.id]: { ...prev[it.id], salePrice: Number(e.target.value) || 0 } }))}
                            className="w-20 h-8 text-right text-sm"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{formatPKR(lineTotal)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Total */}
            <div className="flex justify-end">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Grand Total</div>
                <div className="text-2xl font-bold text-primary">
                  {formatPKR(
                    Object.entries(convertItems)
                      .filter(([_, v]) => v.selected)
                      .reduce((s, [_, v]) => s + v.approvedQty * v.purchasePrice, 0)
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button onClick={handleConvert} disabled={converting} className="bg-emerald-600 hover:bg-emerald-700">
              {converting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Create Purchase & Update Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear All confirmation */}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all draft POs?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all {pendingItems.length} pending draft items. This action cannot be undone. Converted items will remain in history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
