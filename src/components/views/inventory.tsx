'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { PageHeader, StatCard, formatPKR, formatDate, formatDateTime, formatQty, EmptyState } from '@/components/ui-helpers'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Plus, Search, Package, AlertTriangle, CalendarClock, XCircle, Boxes,
  Pencil, Trash2, Tags, Loader2, ClipboardList, Barcode, Scan,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav-context'

// ============== Types ==============
interface MedicineItem {
  id: string
  name: string
  genericName?: string | null
  manufacturer?: string | null
  categoryId?: string | null
  barcode?: string | null
  unitType: string
  prescriptionRequired: boolean
  purchasePrice: number
  retailPrice: number
  stripPrice: number
  boxPrice: number
  minStock: number
  maxStock: number
  rackLocation?: string | null
  notes?: string | null
  isActive: boolean
  categoryName?: string | null
  stock: number
  batchesCount: number
  hasExpired: boolean
  hasNearExpiry: boolean
}

interface CategoryRow {
  id: string
  name: string
  description?: string | null
  count: number
}

interface SupplierRow {
  id: string
  name: string
  company?: string | null
  phone?: string | null
}

interface BatchRow {
  id: string
  batchNumber: string
  expiryDate: string
  packSizeBox: number
  packSizeStrip: number
  quantity: number
  purchasePrice: number
  salePrice: number
  freeQuantity: number
  supplierId?: string | null
}

interface StockTxn {
  id: string
  type: string
  quantity: number
  medicine?: string
  batch?: string
  refType?: string | null
  notes?: string | null
  createdAt: string
}

interface MedicineForm {
  name: string
  genericName: string
  manufacturer: string
  categoryId: string
  barcode: string
  unitType: string
  prescriptionRequired: boolean
  purchasePrice: number
  retailPrice: number
  stripPrice: number
  boxPrice: number
  minStock: number
  maxStock: number
  rackLocation: string
  notes: string
  isActive: boolean
}

interface BatchForm {
  id?: string
  batchNumber: string
  expiryDate: string
  packSizeBox: number
  packSizeStrip: number
  quantity: number
  purchasePrice: number
  salePrice: number
  freeQuantity: number
  supplierId: string
}

const UNIT_TYPES = ['TABLET', 'CAPSULE', 'BOTTLE', 'STRIP', 'BOX', 'PIECE', 'TUBE', 'INJECTION']

const EMPTY_MED_FORM: MedicineForm = {
  name: '', genericName: '', manufacturer: '', categoryId: '', barcode: '',
  unitType: 'TABLET', prescriptionRequired: false,
  purchasePrice: 0, retailPrice: 0, stripPrice: 0, boxPrice: 0,
  minStock: 0, maxStock: 0, rackLocation: '', notes: '', isActive: true,
}

const EMPTY_BATCH_FORM: BatchForm = {
  batchNumber: '', expiryDate: '', packSizeBox: 1, packSizeStrip: 10,
  quantity: 0, purchasePrice: 0, salePrice: 0, freeQuantity: 0, supplierId: '',
}

// ============== Helpers ==============
function toDateInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function StockBadge({ stock, minStock }: { stock: number; minStock: number }) {
  if (stock === 0) {
    return <Badge variant="destructive" className="text-xs font-mono">0 · Out</Badge>
  }
  if (stock <= minStock) {
    return (
      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 text-xs font-mono">
        {formatQty(stock)} · Low
      </Badge>
    )
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs font-mono">
      {formatQty(stock)}
    </Badge>
  )
}

// ============== Main Component ==============
export function InventoryView() {
  const { hasPermission } = useAuth()
  const { navigate } = useNav()
  const canEdit = hasPermission('inventory.edit')
  const canDelete = hasPermission('inventory.delete')

  const [items, setItems] = useState<MedicineItem[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [loading, setLoading] = useState(true)

  // Toolbar state
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Bulk print barcodes
  const handleBulkPrintBarcodes = () => {
    if (selectedIds.length === 0) {
      toast.error('Select at least one medicine to print barcodes')
      return
    }
    // Open new window and POST the IDs
    const w = window.open('', '_blank', 'width=1024,height=720')
    if (!w) {
      toast.error('Pop-up blocked. Please allow pop-ups for this site.')
      return
    }
    w.document.write('<html><head><title>Preparing barcodes...</title></head><body style="font-family:sans-serif;padding:40px;text-align:center"><div style="font-size:18px;color:#666">Preparing ' + selectedIds.length + ' barcode labels…</div></body></html>')
    w.document.close()
    fetch('/api/barcodes/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds }),
    }).then(r => r.text()).then(html => {
      w.document.open()
      w.document.write(html)
      w.document.close()
    }).catch(() => {
      toast.error('Failed to generate bulk barcodes')
      w.close()
    })
  }

  // Add/Edit medicine dialog
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [form, setForm] = useState<MedicineForm>(EMPTY_MED_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailMed, setDetailMed] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTab, setDetailTab] = useState<'batches' | 'movements'>('batches')
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [stockTxns, setStockTxns] = useState<StockTxn[]>([])
  const [stockLoading, setStockLoading] = useState(false)

  // Batch dialog
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchMode, setBatchMode] = useState<'add' | 'edit'>('add')
  const [batchForm, setBatchForm] = useState<BatchForm>(EMPTY_BATCH_FORM)
  const [batchSubmitting, setBatchSubmitting] = useState(false)

  // Categories dialog
  const [catOpen, setCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatDesc, setNewCatDesc] = useState('')
  const [catSubmitting, setCatSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [medsRes, catsRes, supsRes] = await Promise.all([
        fetch('/api/medicines').then(r => r.json()),
        fetch('/api/categories').then(r => r.json()),
        fetch('/api/suppliers').then(r => r.json()),
      ])
      setItems(medsRes.items || [])
      setCategories(catsRes.categories || [])
      setSuppliers(supsRes.suppliers || [])
    } catch {
      toast.error('Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const refreshCategories = useCallback(async () => {
    try {
      const c = await fetch('/api/categories').then(r => r.json())
      setCategories(c.categories || [])
    } catch { /* ignore */ }
  }, [])

  // ============== Computed ==============
  const stats = useMemo(() => ({
    total: items.length,
    low: items.filter(i => i.stock > 0 && i.stock <= i.minStock).length,
    nearExpiry: items.filter(i => i.hasNearExpiry && !i.hasExpired).length,
    expired: items.filter(i => i.hasExpired).length,
  }), [items])

  const filtered = useMemo(() => {
    let list = items
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.genericName || '').toLowerCase().includes(q) ||
        (i.manufacturer || '').toLowerCase().includes(q) ||
        (i.barcode || '').toLowerCase().includes(q)
      )
    }
    if (categoryFilter !== 'all') {
      list = list.filter(i => i.categoryId === categoryFilter)
    }
    if (statusFilter !== 'all') {
      list = list.filter(i => statusFilter === 'active' ? i.isActive : !i.isActive)
    }
    if (stockFilter !== 'all') {
      list = list.filter(i => stockFilter === 'out' ? i.stock === 0 : (i.stock > 0 && i.stock <= i.minStock))
    }
    return list
  }, [items, search, categoryFilter, statusFilter, stockFilter])

  const activeFiltersCount =
    (search.trim() ? 1 : 0) +
    (categoryFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (stockFilter !== 'all' ? 1 : 0)

  // ============== Medicine form handlers ==============
  const openAdd = () => {
    setForm({ ...EMPTY_MED_FORM })
    setFormMode('add')
    setEditId(null)
    setFormOpen(true)
  }

  const openEdit = (item: MedicineItem | any) => {
    setForm({
      name: item.name || '',
      genericName: item.genericName || '',
      manufacturer: item.manufacturer || '',
      categoryId: item.categoryId || '',
      barcode: item.barcode || '',
      unitType: item.unitType || 'TABLET',
      prescriptionRequired: !!item.prescriptionRequired,
      purchasePrice: Number(item.purchasePrice) || 0,
      retailPrice: Number(item.retailPrice) || 0,
      stripPrice: Number(item.stripPrice) || 0,
      boxPrice: Number(item.boxPrice) || 0,
      minStock: Number(item.minStock) || 0,
      maxStock: Number(item.maxStock) || 0,
      rackLocation: item.rackLocation || '',
      notes: item.notes || '',
      isActive: item.isActive !== false,
    })
    setFormMode('edit')
    setEditId(item.id)
    setFormOpen(true)
  }

  const saveMedicine = async () => {
    if (!form.name.trim()) { toast.error('Medicine name is required'); return }
    setSubmitting(true)
    try {
      const body = {
        name: form.name.trim(),
        genericName: form.genericName || null,
        manufacturer: form.manufacturer || null,
        categoryId: form.categoryId || null,
        barcode: form.barcode || null,
        unitType: form.unitType,
        prescriptionRequired: form.prescriptionRequired,
        purchasePrice: Number(form.purchasePrice) || 0,
        retailPrice: Number(form.retailPrice) || 0,
        stripPrice: Number(form.stripPrice) || 0,
        boxPrice: Number(form.boxPrice) || 0,
        minStock: Number(form.minStock) || 0,
        maxStock: Number(form.maxStock) || 0,
        rackLocation: form.rackLocation || null,
        notes: form.notes || null,
        isActive: form.isActive,
      }
      const url = formMode === 'add' ? '/api/medicines' : `/api/medicines/${editId}`
      const method = formMode === 'add' ? 'POST' : 'PUT'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Failed to save medicine'); return }
      toast.success(formMode === 'add' ? 'Medicine added' : 'Medicine updated')
      setFormOpen(false)
      fetchData()
    } catch {
      toast.error('Failed to save medicine')
    } finally {
      setSubmitting(false)
    }
  }

  const deactivateMedicine = async (item: MedicineItem) => {
    try {
      const r = await fetch(`/api/medicines/${item.id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Failed to deactivate'); return }
      toast.success(`"${item.name}" deactivated`)
      fetchData()
    } catch {
      toast.error('Failed to deactivate medicine')
    }
  }

  // ============== Detail dialog ==============
  const openDetail = async (item: MedicineItem) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailMed(item)
    setBatches([])
    setStockTxns([])
    setDetailTab('batches')
    try {
      const r = await fetch(`/api/medicines/${item.id}`)
      const d = await r.json()
      if (r.ok) {
        setDetailMed(d.medicine)
        setBatches(d.medicine.batches || [])
      } else {
        toast.error(d.error || 'Failed to load medicine')
      }
    } catch {
      toast.error('Failed to load medicine details')
    } finally {
      setDetailLoading(false)
    }
  }

  const refreshBatches = async (medId: string) => {
    try {
      const r = await fetch(`/api/medicines/${medId}/batches`)
      const d = await r.json()
      if (r.ok) {
        const bs = d.batches || []
        setBatches(bs)
        setDetailMed((prev: any) => prev ? { ...prev, batches: bs } : prev)
      }
    } catch { /* ignore */ }
  }

  const refreshStockTxns = async (medId: string) => {
    setStockLoading(true)
    try {
      const r = await fetch(`/api/stock?medicineId=${medId}`)
      const d = await r.json()
      if (r.ok) setStockTxns(d.txns || [])
    } catch { /* ignore */ }
    finally { setStockLoading(false) }
  }

  useEffect(() => {
    if (detailOpen && detailTab === 'movements' && detailMed) {
      refreshStockTxns(detailMed.id)
    }
  }, [detailOpen, detailTab, detailMed])

  // ============== Batch dialog ==============
  const openAddBatch = () => {
    setBatchForm({ ...EMPTY_BATCH_FORM })
    setBatchMode('add')
    setBatchOpen(true)
  }

  const openEditBatch = (b: BatchRow) => {
    setBatchForm({
      id: b.id,
      batchNumber: b.batchNumber,
      expiryDate: toDateInput(b.expiryDate),
      packSizeBox: Number(b.packSizeBox) || 1,
      packSizeStrip: Number(b.packSizeStrip) || 1,
      quantity: Number(b.quantity) || 0,
      purchasePrice: Number(b.purchasePrice) || 0,
      salePrice: Number(b.salePrice) || 0,
      freeQuantity: Number(b.freeQuantity) || 0,
      supplierId: b.supplierId || '',
    })
    setBatchMode('edit')
    setBatchOpen(true)
  }

  const saveBatch = async () => {
    if (!detailMed) return
    if (!batchForm.batchNumber.trim()) { toast.error('Batch number is required'); return }
    if (!batchForm.expiryDate) { toast.error('Expiry date is required'); return }
    setBatchSubmitting(true)
    try {
      const body = {
        id: batchForm.id,
        batchNumber: batchForm.batchNumber.trim(),
        expiryDate: batchForm.expiryDate,
        packSizeBox: Number(batchForm.packSizeBox) || 1,
        packSizeStrip: Number(batchForm.packSizeStrip) || 1,
        quantity: Number(batchForm.quantity) || 0,
        purchasePrice: Number(batchForm.purchasePrice) || 0,
        salePrice: Number(batchForm.salePrice) || 0,
        freeQuantity: Number(batchForm.freeQuantity) || 0,
        supplierId: batchForm.supplierId || null,
      }
      const url = `/api/medicines/${detailMed.id}/batches`
      const method = batchMode === 'add' ? 'POST' : 'PUT'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Failed to save batch'); return }
      toast.success(batchMode === 'add' ? 'Batch added' : 'Batch updated')
      setBatchOpen(false)
      await refreshBatches(detailMed.id)
      fetchData()
    } catch {
      toast.error('Failed to save batch')
    } finally {
      setBatchSubmitting(false)
    }
  }

  // ============== Categories ==============
  const addCategory = async () => {
    if (!newCatName.trim()) { toast.error('Category name is required'); return }
    setCatSubmitting(true)
    try {
      const r = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim(), description: newCatDesc || null }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Failed to add category'); return }
      toast.success('Category added')
      setNewCatName('')
      setNewCatDesc('')
      await refreshCategories()
    } catch {
      toast.error('Failed to add category')
    } finally {
      setCatSubmitting(false)
    }
  }

  const deleteCategory = async (c: CategoryRow) => {
    try {
      const r = await fetch(`/api/categories?id=${c.id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Failed to delete'); return }
      toast.success(`Category "${c.name}" deleted`)
      await refreshCategories()
      fetchData()
    } catch {
      toast.error('Failed to delete category')
    }
  }

  // ============== Helpers ==============
  const supplierName = (id?: string | null) => {
    if (!id) return '-'
    const s = suppliers.find(s => s.id === id)
    return s ? s.name : 'Unknown'
  }

  const resetFilters = () => {
    setSearch('')
    setCategoryFilter('all')
    setStatusFilter('all')
    setStockFilter('all')
  }

  // ============== Render: Loading ==============
  if (loading) {
    return (
      <div>
        <PageHeader title="Medicine Inventory" subtitle="Loading inventory…" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-12 rounded-lg mb-3" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Medicine Inventory"
        subtitle={`${stats.total} medicine${stats.total !== 1 ? 's' : ''} · ${filtered.length} shown${activeFiltersCount > 0 ? ` · ${activeFiltersCount} filter${activeFiltersCount > 1 ? 's' : ''} active` : ''}${selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ''}`}
        actions={
          <>
            {selectedIds.length > 0 && (
              <Button variant="default" size="sm" onClick={handleBulkPrintBarcodes} className="bg-primary">
                <Barcode className="h-4 w-4" />
                <span className="hidden sm:inline">Print {selectedIds.length} Barcode{selectedIds.length !== 1 ? 's' : ''}</span>
                <span className="sm:hidden">{selectedIds.length}</span>
              </Button>
            )}
            {selectedIds.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} className="text-muted-foreground">
                Clear
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setCatOpen(true)}>
                <Tags className="h-4 w-4" />
                <span className="hidden sm:inline">Manage Categories</span>
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => navigate('scan')} className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900/20">
                <Scan className="h-4 w-4" />
                <span className="hidden sm:inline">Scan Medicine</span>
              </Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4" />
                Add Medicine
              </Button>
            )}
          </>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Medicines" value={stats.total} icon={Package} tone="info" hint="In inventory" />
        <StatCard label="Low Stock" value={stats.low} icon={AlertTriangle} tone="warning" hint="Stock ≤ min level" />
        <StatCard label="Near Expiry" value={stats.nearExpiry} icon={CalendarClock} tone="warning" hint="Expiring ≤ 90 days" />
        <StatCard label="Expired" value={stats.expired} icon={XCircle} tone="danger" hint="Has expired batches" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search name, generic, manufacturer, barcode…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as 'all' | 'low' | 'out')}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
        {activeFiltersCount > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Reset
          </Button>
        )}
      </div>

      {/* Medicines table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="sticky top-0 z-10 bg-muted/50 w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded cursor-pointer"
                    checked={selectedIds.length > 0 && selectedIds.length === filtered.length}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < filtered.length }}
                    onChange={(e) => setSelectedIds(e.target.checked ? filtered.map(m => m.id) : [])}
                    title="Select all"
                  />
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/50">Name</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/50">Generic / Salt</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/50">Manufacturer</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/50">Category</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/50 text-right">Stock</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/50 text-right">Min</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/50 text-right">Retail</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/50 text-right">Strip / Box</TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/50">Status</TableHead>
                {canEdit && <TableHead className="sticky top-0 z-10 bg-muted/50 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 11 : 10} className="border-0">
                    <EmptyState
                      icon={Package}
                      title={activeFiltersCount > 0 ? 'No medicines match the filters' : 'No medicines yet'}
                      description={activeFiltersCount > 0
                        ? 'Try adjusting your search or filters.'
                        : canEdit
                          ? 'Click "Add Medicine" to create your first medicine record.'
                          : 'No medicines have been added to the inventory.'}
                      action={activeFiltersCount > 0 ? <Button size="sm" variant="outline" onClick={resetFilters}>Reset filters</Button> : undefined}
                    />
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(item => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => openDetail(item)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded cursor-pointer"
                      checked={selectedIds.includes(item.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(prev => [...prev, item.id])
                        else setSelectedIds(prev => prev.filter(id => id !== item.id))
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">{item.name}</span>
                      {item.prescriptionRequired && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 leading-none">Rx</Badge>
                      )}
                      {item.hasExpired && (
                        <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4 leading-none">Expired</Badge>
                      )}
                      {item.hasNearExpiry && !item.hasExpired && (
                        <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800 text-[10px] px-1 py-0 h-4 leading-none">
                          Near Expiry
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.genericName || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{item.manufacturer || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{item.categoryName || '-'}</TableCell>
                  <TableCell className="text-right"><StockBadge stock={item.stock} minStock={item.minStock} /></TableCell>
                  <TableCell className="text-right text-muted-foreground font-mono text-xs">{formatQty(item.minStock)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatPKR(item.retailPrice)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {formatPKR(item.stripPrice)} <span className="text-muted-foreground/50">/</span> {formatPKR(item.boxPrice)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? 'default' : 'outline'} className="text-xs">
                      {item.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => window.open(`/api/medicines/${item.id}/barcode`, '_blank', 'width=420,height=600')}
                          title="Print barcode label"
                        >
                          <Barcode className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEdit(item)}
                          title="Edit medicine"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                title="Deactivate medicine"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Deactivate medicine?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will mark <b>{item.name}</b> as inactive. It will no longer appear in the POS for new sales, but its batches and history remain intact. You can re-activate it later by editing the medicine.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                  onClick={() => deactivateMedicine(item)}
                                >
                                  Deactivate
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ============== Add/Edit Medicine dialog ============== */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formMode === 'add' ? 'Add Medicine' : 'Edit Medicine'}</DialogTitle>
            <DialogDescription>
              {formMode === 'add'
                ? 'Create a new medicine record with pricing and stock thresholds.'
                : `Editing "${form.name}"`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label htmlFor="med-name">Name *</Label>
              <Input id="med-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Panadol 500mg" />
            </div>
            <div>
              <Label htmlFor="med-generic">Generic / Salt</Label>
              <Input id="med-generic" value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} placeholder="e.g. Paracetamol" />
            </div>
            <div>
              <Label htmlFor="med-mfr">Manufacturer</Label>
              <Input id="med-mfr" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="e.g. GSK" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.categoryId || '_none'} onValueChange={(v) => setForm({ ...form, categoryId: v === '_none' ? '' : v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No category</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="med-barcode">Barcode / SKU</Label>
              <Input id="med-barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Scan or type barcode" />
            </div>
            <div>
              <Label>Unit Type</Label>
              <Select value={form.unitType} onValueChange={(v) => setForm({ ...form, unitType: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <div className="flex items-center justify-between rounded-md border p-3 w-full">
                <div>
                  <Label htmlFor="med-rx" className="mb-0">Prescription Required</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Display Rx badge in POS</p>
                </div>
                <Switch id="med-rx" checked={form.prescriptionRequired} onCheckedChange={(v) => setForm({ ...form, prescriptionRequired: v })} />
              </div>
            </div>
            <div>
              <Label htmlFor="med-pp">Purchase Price (Rs)</Label>
              <Input id="med-pp" type="number" step="any" min="0" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label htmlFor="med-rp">Retail Price (Rs)</Label>
              <Input id="med-rp" type="number" step="any" min="0" value={form.retailPrice} onChange={(e) => setForm({ ...form, retailPrice: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label htmlFor="med-sp">Strip Price (Rs)</Label>
              <Input id="med-sp" type="number" step="any" min="0" value={form.stripPrice} onChange={(e) => setForm({ ...form, stripPrice: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label htmlFor="med-bp">Box Price (Rs)</Label>
              <Input id="med-bp" type="number" step="any" min="0" value={form.boxPrice} onChange={(e) => setForm({ ...form, boxPrice: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label htmlFor="med-min">Min Stock</Label>
              <Input id="med-min" type="number" step="any" min="0" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label htmlFor="med-max">Max Stock</Label>
              <Input id="med-max" type="number" step="any" min="0" value={form.maxStock} onChange={(e) => setForm({ ...form, maxStock: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label htmlFor="med-rack">Rack Location</Label>
              <Input id="med-rack" value={form.rackLocation} onChange={(e) => setForm({ ...form, rackLocation: e.target.value })} placeholder="e.g. A-12" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="med-notes">Notes</Label>
              <Textarea id="med-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal notes (storage, side effects, etc.)" />
            </div>
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="med-active" className="mb-0">Active</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Inactive medicines won't appear in POS</p>
              </div>
              <Switch id="med-active" checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={saveMedicine} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {formMode === 'add' ? 'Add Medicine' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== Detail dialog ============== */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap pr-6">
              <span>{detailMed?.name || 'Medicine'}</span>
              {detailMed?.prescriptionRequired && <Badge variant="secondary" className="text-xs">Rx</Badge>}
              {detailMed?.isActive
                ? <Badge variant="default" className="text-xs">Active</Badge>
                : <Badge variant="outline" className="text-xs">Inactive</Badge>}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 text-xs"
                onClick={() => window.open(`/api/medicines/${detailMed?.id}/barcode`, '_blank', 'width=420,height=600')}
                title="Print barcode label"
              >
                <Barcode className="h-3.5 w-3.5 mr-1" /> Print Barcode
              </Button>
            </DialogTitle>
            <DialogDescription>
              {detailMed?.genericName || 'No generic name'}
              {detailMed?.manufacturer ? ` · ${detailMed.manufacturer}` : ''}
              {detailMed?.category?.name ? ` · ${detailMed.category.name}` : ''}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 rounded-md" />
              <Skeleton className="h-40 rounded-md" />
            </div>
          ) : detailMed ? (
            <>
              {/* Info grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Stock</div>
                  <div className="font-semibold">{detailMed.batches?.reduce((s: number, b: any) => s + (Number(b.quantity) || 0), 0) ?? 0} units</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Batches</div>
                  <div className="font-semibold">{detailMed.batches?.length ?? 0}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Retail</div>
                  <div className="font-semibold font-mono text-xs">{formatPKR(detailMed.retailPrice)}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Box / Strip</div>
                  <div className="font-semibold font-mono text-xs">{formatPKR(detailMed.boxPrice)} / {formatPKR(detailMed.stripPrice)}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Barcode</div>
                  <div className="font-mono text-xs">{detailMed.barcode || '-'}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Rack</div>
                  <div className="font-semibold text-xs">{detailMed.rackLocation || '-'}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Min / Max</div>
                  <div className="font-semibold text-xs font-mono">{formatQty(detailMed.minStock)} / {formatQty(detailMed.maxStock)}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Unit Type</div>
                  <div className="font-semibold text-xs">{detailMed.unitType}</div>
                </div>
              </div>

              {detailMed.notes && (
                <div className="text-xs text-muted-foreground border-l-2 pl-2 italic">
                  {detailMed.notes}
                </div>
              )}

              {canEdit && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const item = items.find(i => i.id === detailMed.id) || detailMed
                      setDetailOpen(false)
                      openEdit(item)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit medicine
                  </Button>
                </div>
              )}

              <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as 'batches' | 'movements')}>
                <TabsList>
                  <TabsTrigger value="batches"><Boxes className="h-3.5 w-3.5" /> Batches</TabsTrigger>
                  <TabsTrigger value="movements"><ClipboardList className="h-3.5 w-3.5" /> Movements</TabsTrigger>
                </TabsList>

                {/* Batches tab */}
                <TabsContent value="batches" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{batches.length} batch(es) registered</p>
                    {canEdit && (
                      <Button size="sm" onClick={openAddBatch}>
                        <Plus className="h-4 w-4" />
                        Add Batch
                      </Button>
                    )}
                  </div>
                  <div className="rounded-md border">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead>Batch #</TableHead>
                            <TableHead>Expiry</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Purchase</TableHead>
                            <TableHead className="text-right">Sale</TableHead>
                            <TableHead>Supplier</TableHead>
                            {canEdit && <TableHead className="text-right">Edit</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {batches.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={canEdit ? 7 : 6} className="text-center text-muted-foreground py-6 text-sm">
                                No batches yet. Add a batch to track stock and expiry.
                              </TableCell>
                            </TableRow>
                          )}
                          {batches.map(b => {
                            const expired = new Date(b.expiryDate) < new Date()
                            const daysLeft = Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / 86400000)
                            const nearExpiry = !expired && daysLeft <= 90
                            return (
                              <TableRow key={b.id}>
                                <TableCell className="font-mono text-xs">{b.batchNumber}</TableCell>
                                <TableCell>
                                  <span className={cn(
                                    'text-xs',
                                    expired ? 'text-red-600 dark:text-red-400 font-semibold'
                                    : nearExpiry ? 'text-orange-600 dark:text-orange-400 font-medium'
                                    : 'text-muted-foreground'
                                  )}>
                                    {formatDate(b.expiryDate)}
                                    {expired ? ' · Expired' : nearExpiry ? ` · ${daysLeft}d left` : ''}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs">{b.quantity}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{formatPKR(b.purchasePrice)}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{formatPKR(b.salePrice)}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{supplierName(b.supplierId)}</TableCell>
                                {canEdit && (
                                  <TableCell className="text-right">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => openEditBatch(b)}
                                      title="Edit batch"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>

                {/* Movements tab */}
                <TabsContent value="movements">
                  {stockLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-md" />)}
                    </div>
                  ) : stockTxns.length === 0 ? (
                    <div className="text-center text-muted-foreground text-sm py-8">
                      No stock movements recorded for this medicine.
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                              <TableHead>Date</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Batch</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead>Ref</TableHead>
                              <TableHead>Notes</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stockTxns.map(t => (
                              <TableRow key={t.id}>
                                <TableCell className="text-xs">{formatDateTime(t.createdAt)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px]">{t.type}</Badge>
                                </TableCell>
                                <TableCell className="font-mono text-xs">{t.batch || '-'}</TableCell>
                                <TableCell className={cn(
                                  'text-right font-mono text-xs',
                                  t.quantity >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                                )}>
                                  {t.quantity > 0 ? '+' : ''}{t.quantity}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{t.refType || '-'}</TableCell>
                                <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{t.notes || '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== Batch dialog ============== */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{batchMode === 'add' ? 'Add Batch' : 'Edit Batch'}</DialogTitle>
            <DialogDescription>
              {batchMode === 'add'
                ? `Register a new stock batch for ${detailMed?.name || 'this medicine'}.`
                : `Editing batch ${batchForm.batchNumber}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bat-num">Batch Number *</Label>
              <Input id="bat-num" value={batchForm.batchNumber} onChange={(e) => setBatchForm({ ...batchForm, batchNumber: e.target.value })} placeholder="e.g. BN2401" />
            </div>
            <div>
              <Label htmlFor="bat-exp">Expiry Date *</Label>
              <Input id="bat-exp" type="date" value={batchForm.expiryDate} onChange={(e) => setBatchForm({ ...batchForm, expiryDate: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="bat-pb">Pack Size (Box)</Label>
              <Input id="bat-pb" type="number" step="any" min="1" value={batchForm.packSizeBox} onChange={(e) => setBatchForm({ ...batchForm, packSizeBox: Number(e.target.value) || 1 })} />
            </div>
            <div>
              <Label htmlFor="bat-ps">Pack Size (Strip)</Label>
              <Input id="bat-ps" type="number" step="any" min="1" value={batchForm.packSizeStrip} onChange={(e) => setBatchForm({ ...batchForm, packSizeStrip: Number(e.target.value) || 1 })} />
            </div>
            <div>
              <Label htmlFor="bat-qty">Quantity (base units) *</Label>
              <Input id="bat-qty" type="number" step="any" min="0" value={batchForm.quantity} onChange={(e) => setBatchForm({ ...batchForm, quantity: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label htmlFor="bat-fq">Free Quantity</Label>
              <Input id="bat-fq" type="number" step="any" min="0" value={batchForm.freeQuantity} onChange={(e) => setBatchForm({ ...batchForm, freeQuantity: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label htmlFor="bat-pp">Purchase Price (Rs/unit)</Label>
              <Input id="bat-pp" type="number" step="any" min="0" value={batchForm.purchasePrice} onChange={(e) => setBatchForm({ ...batchForm, purchasePrice: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label htmlFor="bat-sp">Sale Price (Rs/unit)</Label>
              <Input id="bat-sp" type="number" step="any" min="0" value={batchForm.salePrice} onChange={(e) => setBatchForm({ ...batchForm, salePrice: Number(e.target.value) || 0 })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Supplier</Label>
              <Select value={batchForm.supplierId || '_none'} onValueChange={(v) => setBatchForm({ ...batchForm, supplierId: v === '_none' ? '' : v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No supplier</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.company ? ` (${s.company})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)} disabled={batchSubmitting}>Cancel</Button>
            <Button onClick={saveBatch} disabled={batchSubmitting}>
              {batchSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {batchMode === 'add' ? 'Add Batch' : 'Save Batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== Categories dialog ============== */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>Add new categories or remove unused ones.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 border rounded-md p-3 bg-muted/30">
              <Label htmlFor="cat-name">New Category</Label>
              <Input id="cat-name" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name (e.g. Antibiotics)" />
              <Input value={newCatDesc} onChange={(e) => setNewCatDesc(e.target.value)} placeholder="Description (optional)" />
              <Button size="sm" onClick={addCategory} disabled={catSubmitting}>
                {catSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Category
              </Button>
            </div>

            <div className="space-y-1 max-h-64 overflow-y-auto">
              {categories.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-4">No categories yet.</div>
              )}
              {categories.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    {c.description && <div className="text-xs text-muted-foreground truncate">{c.description}</div>}
                    <div className="text-[10px] text-muted-foreground mt-0.5">{c.count} medicine(s)</div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                        disabled={c.count > 0}
                        title={c.count > 0 ? `Cannot delete: ${c.count} medicine(s) use this category` : 'Delete category'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete category?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {c.count > 0
                            ? `Cannot delete "${c.name}": ${c.count} medicine(s) are still assigned to it. Reassign or deactivate those medicines first.`
                            : `Are you sure you want to delete "${c.name}"? This action cannot be undone.`}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        {c.count === 0 && (
                          <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => deleteCategory(c)}
                          >
                            Delete
                          </AlertDialogAction>
                        )}
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
