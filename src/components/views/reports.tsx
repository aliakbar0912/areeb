'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  PageHeader, StatCard, EmptyState, formatPKR, formatCompactPKR, formatDate, cn,
} from '@/components/ui-helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts'
import {
  ShoppingCart, TrendingUp, Package, Truck, Users, Building2, Wallet,
  Download, Printer, FileText, ArrowUp, ArrowDown, ArrowUpDown,
  CalendarClock, PackageX, Boxes, Search, BarChart3,
  Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

/* ---------------- helpers ---------------- */

function escapeCsv(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(escapeCsv).join(',')]
  for (const r of rows) lines.push(r.map(escapeCsv).join(','))
  return lines.join('\n')
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  if (!rows.length) { toast.info('Nothing to export'); return }
  const csv = buildCsv(headers, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success(`Exported ${rows.length} rows to CSV`)
}

function printReport(
  title: string, subtitle: string,
  headers: string[], rows: (string | number)[][],
  totals?: [string, string | number][],
) {
  if (!rows.length) { toast.info('Nothing to print'); return }
  const thead = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`
  const tbody = rows.map(r =>
    `<tr>${r.map(c => `<td>${c == null ? '' : c}</td>`).join('')}</tr>`,
  ).join('')
  const tfoot = totals && totals.length
    ? `<tfoot>${totals.map(([l, v]) =>
        `<tr><td colspan="${Math.max(1, headers.length - 1)}" style="text-align:right">${l}</td>` +
        `<td style="text-align:right;font-family:ui-monospace,monospace">${v}</td></tr>`,
      ).join('')}</tfoot>`
    : ''
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
    <title>${title}</title>
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; padding: 24px; color: #111; max-width: 920px; margin: 0 auto; }
      .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      h2 { font-size: 12px; font-weight: 500; color: #555; margin: 0; }
      .meta { text-align: right; color: #555; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      thead th { background: #f3f4f6; text-align: left; padding: 8px 10px; border-bottom: 1px solid #d1d5db; font-weight: 600; font-size: 10px; text-transform: uppercase; color: #374151; }
      tbody td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
      tfoot td { padding: 10px; border-top: 2px solid #111; font-weight: 700; font-size: 13px; }
      .note { margin-top: 24px; font-size: 11px; color: #9ca3af; text-align: center; }
      @media print { body { padding: 12px; } }
    </style></head><body>
    <div class="header">
      <div>
        <h1>Pharmacy Report</h1>
        <h2>${title}</h2>
      </div>
      <div class="meta">
        <div>Generated: ${new Date().toLocaleString('en-PK')}</div>
        ${subtitle ? `<div>${subtitle}</div>` : ''}
      </div>
    </div>
    <table>
      <thead>${thead}</thead>
      <tbody>${tbody}</tbody>
      ${tfoot}
    </table>
    <p class="note">Tip: Use "Save as PDF" in the print dialog to export this report.</p>
    <script>window.onload = () => { window.print(); }</script>
    </body></html>`
  const w = window.open('', '_blank', 'width=920,height=1024')
  if (!w) { toast.error('Popup blocked. Allow popups for this site.'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
function nDaysAgo(n: number) { const d = startOfToday(); d.setDate(d.getDate() - n); return d }
function nMonthsAgo(n: number) { const d = startOfToday(); d.setMonth(d.getMonth() - n); return d }

const CHART_COLORS = [
  'oklch(0.45 0.13 180)', 'oklch(0.65 0.18 145)', 'oklch(0.55 0.18 60)',
  'oklch(0.55 0.22 305)', 'oklch(0.7 0.18 35)', 'oklch(0.6 0.18 200)',
  'oklch(0.7 0.15 95)', 'oklch(0.5 0.2 280)',
]

/* ---------------- types ---------------- */

type ReportType = 'sales' | 'profit' | 'inventory' | 'purchases' | 'customers' | 'suppliers' | 'expenses'
type SalesTab = 'daily' | 'weekly' | 'monthly' | 'custom'
type ProfitTab = 'medicine' | 'category'
type InventoryTab = 'current' | 'low' | 'expired' | 'near' | 'fast' | 'slow'
type PurchasesTab = 'supplier' | 'date' | 'medicine'
type CustomersTab = 'credit' | 'payments' | 'outstanding'
type SuppliersTab = 'payables' | 'payments' | 'purchases'
type ExpensesTab = 'category' | 'date'

const REPORT_TABS: { key: ReportType; label: string; icon: any }[] = [
  { key: 'sales', label: 'Sales', icon: ShoppingCart },
  { key: 'profit', label: 'Profit', icon: TrendingUp },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'purchases', label: 'Purchases', icon: Truck },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'suppliers', label: 'Suppliers', icon: Building2 },
  { key: 'expenses', label: 'Expenses', icon: Wallet },
]

const USES_DATE: ReportType[] = ['sales', 'profit', 'purchases', 'expenses']

const STATUS_TONE: Record<string, string> = {
  OUT_OF_STOCK: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  LOW_STOCK: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  OVERSTOCK: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  OK: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  EXPIRED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  EXPIRY_30: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  EXPIRY_60: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  EXPIRY_90: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  SAFE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

/* ---------------- main component ---------------- */

export function ReportsView() {
  const { hasPermission } = useAuth()
  const canView = hasPermission('reports.view')

  const [reportType, setReportType] = useState<ReportType>('sales')
  const [salesTab, setSalesTab] = useState<SalesTab>('daily')
  const [profitTab, setProfitTab] = useState<ProfitTab>('medicine')
  const [invTab, setInvTab] = useState<InventoryTab>('current')
  const [purTab, setPurTab] = useState<PurchasesTab>('supplier')
  const [custTab, setCustTab] = useState<CustomersTab>('outstanding')
  const [supTab, setSupTab] = useState<SuppliersTab>('payables')
  const [expTab, setExpTab] = useState<ExpensesTab>('category')

  const [customFrom, setCustomFrom] = useState(isoDate(nDaysAgo(30)))
  const [customTo, setCustomTo] = useState(isoDate(new Date()))

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const range = useMemo(() => {
    if (!USES_DATE.includes(reportType)) return { from: '', to: '' }
    if (reportType === 'sales') {
      if (salesTab === 'daily') return { from: isoDate(nDaysAgo(30)), to: isoDate(new Date()) }
      if (salesTab === 'weekly') return { from: isoDate(nDaysAgo(84)), to: isoDate(new Date()) }
      if (salesTab === 'monthly') return { from: isoDate(nMonthsAgo(12)), to: isoDate(new Date()) }
      return { from: customFrom, to: customTo }
    }
    return { from: customFrom, to: customTo }
  }, [reportType, salesTab, customFrom, customTo])

  const showDatePicker = useMemo(() => {
    if (reportType === 'sales') return salesTab === 'custom'
    return USES_DATE.includes(reportType)
  }, [reportType, salesTab])

  useEffect(() => {
    if (!canView) return
    let cancelled = false
    setLoading(true)
    setData(null)
    setSearch('')
    setSortKey('')

    ;(async () => {
      try {
        if (reportType === 'inventory' && (invTab === 'fast' || invTab === 'slow')) {
          const [medsRes, salesRes] = await Promise.all([
            fetch('/api/medicines').then(r => r.json()),
            fetch(`/api/sales?from=${isoDate(nDaysAgo(30))}&to=${isoDate(new Date())}&limit=2000`).then(r => r.json()),
          ])
          if (cancelled) return
          const salesByMedName: Record<string, number> = {}
          const salesByMedId: Record<string, number> = {}
          for (const s of salesRes.sales || []) {
            for (const it of s.items || []) {
              const name = it.medicine?.name
              if (name) salesByMedName[name] = (salesByMedName[name] || 0) + it.quantity
              if (it.medicineId) salesByMedId[it.medicineId] = (salesByMedId[it.medicineId] || 0) + it.quantity
            }
          }
          setData({ medicines: medsRes.items || [], salesByMedName, salesByMedId })
        } else if (reportType === 'purchases' && purTab === 'date') {
          const d = await fetch(`/api/purchases?from=${range.from}&to=${range.to}`).then(r => r.json())
          if (cancelled) return
          setData(d)
        } else if (reportType === 'expenses' && expTab === 'date') {
          const d = await fetch(`/api/expenses?from=${range.from}&to=${range.to}`).then(r => r.json())
          if (cancelled) return
          setData(d)
        } else {
          let url = '/api/reports?type='
          if (reportType === 'sales') url += `daily-sales&from=${range.from}&to=${range.to}`
          else if (reportType === 'profit')
            url += (profitTab === 'medicine' ? 'profit-medicine' : 'profit-category') + `&from=${range.from}&to=${range.to}`
          else if (reportType === 'inventory') {
            url += (invTab === 'expired' || invTab === 'near') ? 'expiry-summary' : 'inventory-summary'
          } else if (reportType === 'purchases')
            url += `purchases-summary&from=${range.from}&to=${range.to}`
          else if (reportType === 'customers') url += 'customer-summary'
          else if (reportType === 'suppliers') url += 'supplier-summary'
          else if (reportType === 'expenses')
            url += `expenses-summary&from=${range.from}&to=${range.to}`

          const d = await fetch(url).then(r => r.json())
          if (cancelled) return
          setData(d)
        }
      } catch {
        if (!cancelled) toast.error('Failed to load report')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [reportType, salesTab, profitTab, invTab, purTab, custTab, supTab, expTab, range.from, range.to, canView])

  /* ---------------- derived rows ---------------- */

  const viewRows = useMemo<any[]>(() => {
    if (!data) return []
    if (reportType === 'sales') {
      const rows: any[] = data.rows || []
      if (salesTab === 'weekly') {
        const map: Record<string, { date: string; sales: number; profit: number; count: number }> = {}
        for (const r of rows) {
          const d = new Date(r.date)
          const day = d.getDay() || 7
          const monday = new Date(d)
          monday.setDate(d.getDate() - day + 1)
          const key = monday.toISOString().slice(0, 10)
          if (!map[key]) map[key] = { date: key, sales: 0, profit: 0, count: 0 }
          map[key].sales += r.sales; map[key].profit += r.profit; map[key].count += r.count
        }
        return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
      }
      if (salesTab === 'monthly') {
        const map: Record<string, { date: string; sales: number; profit: number; count: number }> = {}
        for (const r of rows) {
          const key = r.date.slice(0, 7)
          if (!map[key]) map[key] = { date: key + '-01', sales: 0, profit: 0, count: 0 }
          map[key].sales += r.sales; map[key].profit += r.profit; map[key].count += r.count
        }
        return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
      }
      return rows
    }
    if (reportType === 'profit') return data.rows || []
    if (reportType === 'inventory') {
      if (invTab === 'current' || invTab === 'low') {
        const rows: any[] = data.rows || []
        return invTab === 'low'
          ? rows.filter(r => r.status === 'LOW_STOCK' || r.status === 'OUT_OF_STOCK')
          : rows
      }
      if (invTab === 'expired' || invTab === 'near') {
        const rows: any[] = data.rows || []
        if (invTab === 'expired') return rows.filter(r => r.status === 'EXPIRED')
        return rows.filter(r => r.status === 'EXPIRY_30' || r.status === 'EXPIRY_60' || r.status === 'EXPIRY_90')
      }
      if (invTab === 'fast' || invTab === 'slow') {
        const meds: any[] = data.medicines || []
        const salesByMedName = data.salesByMedName || {}
        const enriched = meds.map((m: any) => ({
          ...m,
          sold30d: salesByMedName[m.name] || 0,
        }))
        if (invTab === 'fast') {
          return enriched.filter(m => m.sold30d > 0).sort((a, b) => b.sold30d - a.sold30d).slice(0, 30)
        }
        return enriched.filter(m => m.sold30d < 3).sort((a, b) => (b.stock || 0) - (a.stock || 0)).slice(0, 30)
      }
    }
    if (reportType === 'purchases') {
      if (purTab === 'date') return data.purchases || []
      if (purTab === 'supplier') return data.bySupplier || []
      if (purTab === 'medicine') return data.byMedicine || []
    }
    if (reportType === 'customers') return data.rows || []
    if (reportType === 'suppliers') return data.rows || []
    if (reportType === 'expenses') {
      if (expTab === 'category') return data.byCategory || []
      if (expTab === 'date') return (data.expenses || []).slice().reverse()
    }
    return []
  }, [data, reportType, salesTab, invTab, purTab, expTab])

  /* ---------------- search + sort ---------------- */

  const filteredRows = useMemo(() => {
    if (!viewRows.length) return []
    let rows = viewRows
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)),
      )
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortKey]; const bv = b[sortKey]
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av
        }
        return sortDir === 'asc'
          ? String(av ?? '').localeCompare(String(bv ?? ''))
          : String(bv ?? '').localeCompare(String(av ?? ''))
      })
    }
    return rows
  }, [viewRows, search, sortKey, sortDir])

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  /* ---------------- export data ---------------- */

  const exportPayload = useMemo(() => {
    if (!filteredRows.length) return null
    const today = new Date().toISOString().slice(0, 10)
    const rangeLabel = (range.from || range.to)
      ? `${range.from || '…'} → ${range.to || '…'}`
      : ''
    const suffix = `${reportType}-${today}.csv`

    if (reportType === 'sales') {
      return {
        title: 'Sales Report',
        subtitle: `Period: ${salesTab} • ${rangeLabel}`,
        filename: `sales-${salesTab}-${today}.csv`,
        headers: ['Date', 'Sales (PKR)', 'Profit (PKR)', 'Invoices'],
        rows: filteredRows.map((r: any) => [r.date, r.sales, r.profit, r.count]),
        totals: [
          ['Total Sales', (filteredRows as any[]).reduce((s, r) => s + (r.sales || 0), 0)],
          ['Total Profit', (filteredRows as any[]).reduce((s, r) => s + (r.profit || 0), 0)],
        ] as [string, string | number][],
      }
    }
    if (reportType === 'profit') {
      if (profitTab === 'medicine') {
        return {
          title: 'Profit by Medicine',
          subtitle: rangeLabel,
          filename: `profit-medicine-${today}.csv`,
          headers: ['Medicine', 'Qty Sold', 'Revenue', 'Cost', 'Profit'],
          rows: filteredRows.map((r: any) => [r.name, r.qty, r.revenue, r.cost, r.profit]),
          totals: [['Total Profit', (filteredRows as any[]).reduce((s, r) => s + (r.profit || 0), 0)]],
        }
      }
      return {
        title: 'Profit by Category',
        subtitle: rangeLabel,
        filename: `profit-category-${today}.csv`,
        headers: ['Category', 'Revenue', 'Cost', 'Profit'],
        rows: filteredRows.map((r: any) => [r.name, r.revenue, r.cost, r.profit]),
        totals: [['Total Profit', (filteredRows as any[]).reduce((s, r) => s + (r.profit || 0), 0)]],
      }
    }
    if (reportType === 'inventory') {
      if (invTab === 'current' || invTab === 'low') {
        return {
          title: `Inventory — ${invTab === 'low' ? 'Low Stock' : 'Current Stock'}`,
          subtitle: '',
          filename: `inventory-${invTab}-${today}.csv`,
          headers: ['Medicine', 'Category', 'Stock', 'Min', 'Max', 'Value (PKR)', 'Manufacturer', 'Status'],
          rows: filteredRows.map((r: any) => [r.name, r.category, r.stock, r.minStock, r.maxStock, r.value, r.manufacturer, r.status]),
        }
      }
      if (invTab === 'expired' || invTab === 'near') {
        return {
          title: `Expiry — ${invTab === 'expired' ? 'Expired' : 'Near Expiry'}`,
          subtitle: '',
          filename: `expiry-${invTab}-${today}.csv`,
          headers: ['Medicine', 'Batch', 'Expiry', 'Quantity', 'Cost (PKR)', 'Days Left', 'Status'],
          rows: filteredRows.map((r: any) => [r.medicine, r.batchNumber, r.expiry, r.quantity, r.cost, r.days, r.status]),
        }
      }
      return {
        title: `Inventory — ${invTab === 'fast' ? 'Fast-Moving (30d)' : 'Slow-Moving (30d)'}`,
        subtitle: 'Last 30 days',
        filename: `inventory-${invTab}-${today}.csv`,
        headers: ['Medicine', 'Category', 'Stock', 'Sold (30d)', 'Manufacturer'],
        rows: filteredRows.map((r: any) => [r.name, r.categoryName, r.stock, r.sold30d, r.manufacturer]),
      }
    }
    if (reportType === 'purchases') {
      if (purTab === 'supplier') {
        return {
          title: 'Purchases — Supplier-wise',
          subtitle: rangeLabel,
          filename: `purchases-supplier-${today}.csv`,
          headers: ['Supplier', 'Total (PKR)', 'Paid (PKR)'],
          rows: filteredRows.map((r: any) => [r.name, r.total, r.paid]),
          totals: [['Total', (filteredRows as any[]).reduce((s, r) => s + (r.total || 0), 0)]],
        }
      }
      if (purTab === 'date') {
        return {
          title: 'Purchases — Date-wise',
          subtitle: rangeLabel,
          filename: `purchases-date-${today}.csv`,
          headers: ['Invoice #', 'Date', 'Supplier', 'Total', 'Paid', 'Status'],
          rows: filteredRows.map((r: any) => [r.invoiceNumber, r.invoiceDate?.slice(0, 10), r.supplier?.name || '', r.total, r.paidAmount, r.status]),
          totals: [['Total', (filteredRows as any[]).reduce((s, r) => s + (r.total || 0), 0)]],
        }
      }
      return {
        title: 'Purchases — Medicine-wise',
        subtitle: rangeLabel,
        filename: `purchases-medicine-${today}.csv`,
        headers: ['Medicine', 'Qty', 'Total (PKR)'],
        rows: filteredRows.map((r: any) => [r.name, r.qty, r.total]),
        totals: [['Total', (filteredRows as any[]).reduce((s, r) => s + (r.total || 0), 0)]],
      }
    }
    if (reportType === 'customers') {
      const tabName = custTab === 'credit' ? 'Credit' : custTab === 'payments' ? 'Payments' : 'Outstanding'
      return {
        title: `Customers — ${tabName}`,
        subtitle: '',
        filename: `customers-${custTab}-${today}.csv`,
        headers: ['Name', 'Phone', 'Total Sales', 'Paid', 'Outstanding'],
        rows: filteredRows.map((r: any) => [r.name, r.phone || '', r.total, r.paid, r.outstanding]),
        totals: [['Outstanding', (filteredRows as any[]).reduce((s, r) => s + (r.outstanding || 0), 0)]],
      }
    }
    if (reportType === 'suppliers') {
      const tabName = supTab === 'payables' ? 'Payables' : supTab === 'payments' ? 'Payments' : 'Purchases'
      return {
        title: `Suppliers — ${tabName}`,
        subtitle: '',
        filename: `suppliers-${supTab}-${today}.csv`,
        headers: ['Name', 'Company', 'Total Purchases', 'Paid', 'Payable'],
        rows: filteredRows.map((r: any) => [r.name, r.company || '', r.total, r.paid, r.payable]),
        totals: [['Payable', (filteredRows as any[]).reduce((s, r) => s + (r.payable || 0), 0)]],
      }
    }
    if (reportType === 'expenses') {
      if (expTab === 'category') {
        return {
          title: 'Expenses — Category-wise',
          subtitle: rangeLabel,
          filename: `expenses-category-${today}.csv`,
          headers: ['Category', 'Amount (PKR)'],
          rows: filteredRows.map((r: any) => [r.name, r.amount]),
          totals: [['Total', (filteredRows as any[]).reduce((s, r) => s + (r.amount || 0), 0)]],
        }
      }
      return {
        title: 'Expenses — Date-wise',
        subtitle: rangeLabel,
        filename: `expenses-date-${today}.csv`,
        headers: ['Date', 'Category', 'Amount', 'Description'],
        rows: filteredRows.map((r: any) => [r.date.slice(0, 10), r.category, r.amount, r.description || '']),
        totals: [['Total', (filteredRows as any[]).reduce((s, r) => s + (r.amount || 0), 0)]],
      }
    }
    return null
  }, [filteredRows, reportType, salesTab, profitTab, invTab, purTab, custTab, supTab, expTab, range.from, range.to])

  const handleExportCsv = () => {
    if (!exportPayload) return
    downloadCsv(exportPayload.filename, exportPayload.headers, exportPayload.rows as (string | number)[][])
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExportPdf = () => {
    if (!exportPayload) return
    printReport(
      exportPayload.title,
      exportPayload.subtitle,
      exportPayload.headers,
      exportPayload.rows as (string | number)[][],
      exportPayload.totals as [string, string | number][] | undefined,
    )
  }

  /* ---------------- totals for sales ---------------- */

  const salesTotals = useMemo(() => {
    if (reportType !== 'sales' || !viewRows.length) return null
    const totalSales = viewRows.reduce((s, r) => s + (r.sales || 0), 0)
    const totalProfit = viewRows.reduce((s, r) => s + (r.profit || 0), 0)
    const totalInv = viewRows.reduce((s, r) => s + (r.count || 0), 0)
    const days = viewRows.length || 1
    return { totalSales, totalProfit, totalInv, days, avgSales: totalSales / days, avgProfit: totalProfit / days }
  }, [reportType, viewRows])

  const profitTotals = useMemo(() => {
    if (reportType !== 'profit' || !viewRows.length) return null
    const revenue = viewRows.reduce((s, r) => s + (r.revenue || 0), 0)
    const cost = viewRows.reduce((s, r) => s + (r.cost || 0), 0)
    const profit = viewRows.reduce((s, r) => s + (r.profit || 0), 0)
    return { revenue, cost, profit }
  }, [reportType, viewRows])

  /* ---------------- permission gate ---------------- */

  if (!canView) {
    return (
      <div>
        <PageHeader title="Reports" subtitle="Sales, profit, inventory & financial reports" />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Lock className="h-10 w-10 text-muted-foreground mb-3" />
            <div className="font-semibold">Access denied</div>
            <div className="text-sm text-muted-foreground mt-1">
              You need <code className="font-mono">reports.view</code> permission to view this page.
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* ---------------- loading ---------------- */

  if (loading) {
    return (
      <div>
        <PageHeader title="Reports" subtitle="Sales, profit, inventory & financial reports" />
        <Skeleton className="h-14 rounded-lg mb-3" />
        <Skeleton className="h-10 rounded-lg mb-3 w-72" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-72 rounded-lg mb-3" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    )
  }

  /* ---------------- render ---------------- */

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Sales, profit, inventory & financial reports"
      />

      {/* Report type tabs */}
      <div className="mb-4">
        <Tabs value={reportType} onValueChange={v => setReportType(v as ReportType)}>
          <TabsList className="flex-wrap h-auto">
            {REPORT_TABS.map(t => {
              const Icon = t.icon
              return (
                <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Toolbar: date range + export buttons */}
      <Card className="mb-4">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-3">
            {showDatePicker && (
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">From</label>
                  <Input
                    type="date"
                    value={range.from}
                    onChange={e => { setCustomFrom(e.target.value); if (reportType === 'sales' && salesTab !== 'custom') setSalesTab('custom') }}
                    className="h-9 w-40"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">To</label>
                  <Input
                    type="date"
                    value={range.to}
                    onChange={e => { setCustomTo(e.target.value); if (reportType === 'sales' && salesTab !== 'custom') setSalesTab('custom') }}
                    className="h-9 w-40"
                  />
                </div>
              </div>
            )}

            <div className="relative w-full sm:w-64 sm:ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search rows…"
                className="pl-8 h-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={handlePrint} disabled={!filteredRows.length}>
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!filteredRows.length}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={!filteredRows.length}>
                <FileText className="h-4 w-4" /> Export PDF
              </Button>
            </div>
          </div>
          {reportType === 'sales' && (
            <div className="text-xs text-muted-foreground mt-2">
              {salesTab === 'custom'
                ? `Custom range: ${range.from || '—'} to ${range.to || '—'}`
                : `${salesTab === 'daily' ? 'Daily (last 30 days)' : salesTab === 'weekly' ? 'Weekly (last 12 weeks)' : 'Monthly (last 12 months)'} • ${range.from} to ${range.to}`}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sub-tabs per report type */}
      {reportType === 'sales' && (
        <Tabs value={salesTab} onValueChange={v => setSalesTab(v as SalesTab)} className="mb-4">
          <TabsList className="flex-wrap h-auto mb-4">
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>
          <TabsContent value={salesTab}>
            {salesTotals && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <StatCard label="Total Sales" value={formatCompactPKR(salesTotals.totalSales)} icon={ShoppingCart} tone="info" hint={formatPKR(salesTotals.totalSales)} />
                <StatCard label="Total Profit" value={formatCompactPKR(salesTotals.totalProfit)} icon={TrendingUp} tone="success" hint={formatPKR(salesTotals.totalProfit)} />
                <StatCard label="Avg Sales / Day" value={formatCompactPKR(salesTotals.avgSales)} icon={BarChart3} hint={formatPKR(salesTotals.avgSales)} />
                <StatCard label="Invoices" value={salesTotals.totalInv} icon={Wallet} />
              </div>
            )}

            {filteredRows.length > 0 && (
              <Card className="mb-4 shadow-sm">
                <CardHeader className="pb-2 py-4">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Sales over time</span>
                    <span className="text-xs text-muted-foreground font-normal">{filteredRows.length} data point{filteredRows.length !== 1 ? 's' : ''}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={filteredRows} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="cs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.45 0.13 180)" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="oklch(0.45 0.13 180)" stopOpacity={0.3} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} dy={8} angle={filteredRows.length > 10 ? -45 : 0} textAnchor={filteredRows.length > 10 ? 'end' : 'middle'} height={filteredRows.length > 10 ? 50 : 30} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} width={48} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} formatter={(v: any) => formatPKR(Number(v))} labelStyle={{ fontWeight: 600 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                      <Bar dataKey="sales" fill="url(#cs)" name="Sales" radius={[4, 4, 0, 0]} maxBarSize={60} />
                      <Bar dataKey="profit" fill="oklch(0.65 0.18 145)" name="Profit" radius={[4, 4, 0, 0]} maxBarSize={60} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <ReportTable>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <SortableTh label="Date" k="date" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Sales" k="sales" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <SortableTh label="Profit" k="profit" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <SortableTh label="Invoices" k="count" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r: any) => (
                  <TableRow key={r.date}>
                    <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                    <TableCell className="text-right font-mono">{formatPKR(r.sales)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{formatPKR(r.profit)}</TableCell>
                    <TableCell className="text-right font-mono">{r.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ReportTable>
          </TabsContent>
        </Tabs>
      )}

      {reportType === 'profit' && (
        <Tabs value={profitTab} onValueChange={v => setProfitTab(v as ProfitTab)} className="mb-4">
          <TabsList className="flex-wrap h-auto mb-4">
            <TabsTrigger value="medicine">By Medicine</TabsTrigger>
            <TabsTrigger value="category">By Category</TabsTrigger>
          </TabsList>
          <TabsContent value={profitTab}>
            {profitTotals && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                <StatCard label="Total Revenue" value={formatPKR(profitTotals.revenue)} icon={ShoppingCart} tone="info" />
                <StatCard label="Total Cost" value={formatPKR(profitTotals.cost)} icon={Wallet} tone="warning" />
                <StatCard label="Total Profit" value={formatPKR(profitTotals.profit)} icon={TrendingUp} tone="success" />
              </div>
            )}

            {profitTab === 'medicine' && filteredRows.length > 0 && (
              <Card className="mb-4">
                <CardHeader className="pb-2 py-4">
                  <CardTitle className="text-sm">Top 10 medicines by profit</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={filteredRows.slice(0, 10).sort((a, b) => a.profit - b.profit)} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => formatPKR(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="profit" fill="oklch(0.65 0.18 145)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {profitTab === 'medicine' ? (
              <ReportTable>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <SortableTh label="Medicine" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortableTh label="Qty Sold" k="qty" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                    <SortableTh label="Revenue" k="revenue" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                    <SortableTh label="Cost" k="cost" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                    <SortableTh label="Profit" k="profit" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                    <SortableTh label="Margin %" k="margin" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r: any, i: number) => {
                    const margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right font-mono">{r.qty}</TableCell>
                        <TableCell className="text-right font-mono">{formatPKR(r.revenue)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatPKR(r.cost)}</TableCell>
                        <TableCell className={cn('text-right font-mono font-semibold', r.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                          {formatPKR(r.profit)}
                        </TableCell>
                        <TableCell className={cn('text-right font-mono', margin >= 30 ? 'text-emerald-600 dark:text-emerald-400' : margin >= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
                          {margin.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </ReportTable>
            ) : (
              <>
                {filteredRows.length > 0 && (
                  <Card className="mb-4">
                    <CardHeader className="pb-2 py-4">
                      <CardTitle className="text-sm">Profit by category</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={filteredRows}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: any) => formatPKR(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="revenue" name="Revenue" fill="oklch(0.45 0.13 180)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="cost" name="Cost" fill="oklch(0.7 0.18 35)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="profit" name="Profit" fill="oklch(0.65 0.18 145)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
                <ReportTable>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <SortableTh label="Category" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Revenue" k="revenue" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortableTh label="Cost" k="cost" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortableTh label="Profit" k="profit" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right font-mono">{formatPKR(r.revenue)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatPKR(r.cost)}</TableCell>
                        <TableCell className={cn('text-right font-mono font-semibold', r.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                          {formatPKR(r.profit)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </ReportTable>
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {reportType === 'inventory' && (
        <Tabs value={invTab} onValueChange={v => setInvTab(v as InventoryTab)} className="mb-4">
          <TabsList className="flex-wrap h-auto mb-4">
            <TabsTrigger value="current">Current Stock</TabsTrigger>
            <TabsTrigger value="low">Low Stock</TabsTrigger>
            <TabsTrigger value="expired" className="text-red-700 dark:text-red-400">Expired</TabsTrigger>
            <TabsTrigger value="near" className="text-amber-700 dark:text-amber-400">Near Expiry</TabsTrigger>
            <TabsTrigger value="fast">Fast-Moving</TabsTrigger>
            <TabsTrigger value="slow">Slow-Moving</TabsTrigger>
          </TabsList>
          <TabsContent value={invTab}>
            <ReportTable>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  {(invTab === 'current' || invTab === 'low') && (
                    <>
                      <SortableTh label="Medicine" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Category" k="category" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Stock" k="stock" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortableTh label="Min" k="minStock" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortableTh label="Max" k="maxStock" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortableTh label="Value" k="value" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <th className="hidden md:table-cell">Manufacturer</th>
                      <th>Status</th>
                    </>
                  )}
                  {(invTab === 'expired' || invTab === 'near') && (
                    <>
                      <SortableTh label="Medicine" k="medicine" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <th>Batch</th>
                      <SortableTh label="Expiry" k="expiry" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Quantity" k="quantity" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortableTh label="Cost" k="cost" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortableTh label="Days" k="days" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <th>Status</th>
                    </>
                  )}
                  {(invTab === 'fast' || invTab === 'slow') && (
                    <>
                      <SortableTh label="Medicine" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Category" k="categoryName" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Stock" k="stock" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortableTh label="Sold (30d)" k="sold30d" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <th className="hidden md:table-cell">Manufacturer</th>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r: any, i: number) => {
                  if (invTab === 'current' || invTab === 'low') {
                    return (
                      <TableRow key={r.id || i}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.category || '—'}</TableCell>
                        <TableCell className={cn('text-right font-mono font-semibold', r.stock <= 0 ? 'text-red-600 dark:text-red-400' : r.stock <= r.minStock ? 'text-amber-600 dark:text-amber-400' : '')}>
                          {r.stock} {r.unitType?.toLowerCase()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{r.minStock}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{r.maxStock}</TableCell>
                        <TableCell className="text-right font-mono">{formatPKR(r.value)}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{r.manufacturer || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs', STATUS_TONE[r.status] || '')}>
                            {r.status?.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  }
                  if (invTab === 'expired' || invTab === 'near') {
                    const tone = r.status === 'EXPIRED' ? 'red' : r.status === 'EXPIRY_30' ? 'amber' : r.status === 'EXPIRY_60' ? 'orange' : 'sky'
                    return (
                      <TableRow key={r.id || i}>
                        <TableCell className="font-medium">
                          {r.medicine || '—'}
                          <div className={cn('text-xs font-medium',
                            tone === 'red' ? 'text-red-600 dark:text-red-400' :
                            tone === 'amber' ? 'text-amber-600 dark:text-amber-400' :
                            tone === 'orange' ? 'text-orange-600 dark:text-orange-400' :
                            'text-sky-600 dark:text-sky-400')}>
                            {r.days < 0 ? `Expired ${Math.abs(r.days)}d ago` : `${r.days}d left`}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.batchNumber}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(r.expiry)}</TableCell>
                        <TableCell className="text-right font-mono">{r.quantity}</TableCell>
                        <TableCell className="text-right font-mono">{formatPKR(r.cost)}</TableCell>
                        <TableCell className="text-right font-mono">{r.days}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs', STATUS_TONE[r.status] || '')}>
                            {r.status?.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  }
                  // fast / slow
                  return (
                    <TableRow key={r.id || i}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.categoryName || '—'}</TableCell>
                      <TableCell className={cn('text-right font-mono', r.stock <= 0 ? 'text-red-600 dark:text-red-400' : r.stock <= r.minStock ? 'text-amber-600 dark:text-amber-400' : '')}>
                        {r.stock || 0}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {invTab === 'fast' ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{r.sold30d}</span> : <span className="text-muted-foreground">{r.sold30d}</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{r.manufacturer || '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </ReportTable>
          </TabsContent>
        </Tabs>
      )}

      {reportType === 'purchases' && (
        <Tabs value={purTab} onValueChange={v => setPurTab(v as PurchasesTab)} className="mb-4">
          <TabsList className="flex-wrap h-auto mb-4">
            <TabsTrigger value="supplier">Supplier-wise</TabsTrigger>
            <TabsTrigger value="date">Date-wise</TabsTrigger>
            <TabsTrigger value="medicine">Medicine-wise</TabsTrigger>
          </TabsList>
          <TabsContent value={purTab}>
            {purTab !== 'date' && filteredRows.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                <StatCard label="Total Purchases" value={formatPKR((filteredRows as any[]).reduce((s, r) => s + (r.total || 0), 0))} icon={Truck} tone="info" />
                <StatCard label="Total Paid" value={formatPKR((filteredRows as any[]).reduce((s, r) => s + (r.paid || 0), 0))} icon={Wallet} tone="success" />
                <StatCard label="Suppliers" value={filteredRows.length} icon={Building2} />
              </div>
            )}
            {purTab === 'date' && filteredRows.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                <StatCard label="Total Invoices" value={filteredRows.length} icon={Truck} tone="info" />
                <StatCard label="Total Purchases" value={formatPKR((filteredRows as any[]).reduce((s, r) => s + (r.total || 0), 0))} icon={Wallet} tone="warning" />
                <StatCard label="Total Paid" value={formatPKR((filteredRows as any[]).reduce((s, r) => s + (r.paidAmount || 0), 0))} icon={Wallet} tone="success" />
              </div>
            )}
            <ReportTable>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  {purTab === 'supplier' && (
                    <>
                      <SortableTh label="Supplier" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Total" k="total" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortableTh label="Paid" k="paid" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortableTh label="Balance" k="balance" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                    </>
                  )}
                  {purTab === 'date' && (
                    <>
                      <SortableTh label="Invoice #" k="invoiceNumber" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Date" k="invoiceDate" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <th>Supplier</th>
                      <SortableTh label="Total" k="total" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortableTh label="Paid" k="paidAmount" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <th>Status</th>
                    </>
                  )}
                  {purTab === 'medicine' && (
                    <>
                      <SortableTh label="Medicine" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Qty" k="qty" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortableTh label="Total" k="total" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r: any, i: number) => {
                  if (purTab === 'supplier') {
                    const bal = (r.total || 0) - (r.paid || 0)
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right font-mono">{formatPKR(r.total)}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{formatPKR(r.paid)}</TableCell>
                        <TableCell className={cn('text-right font-mono font-semibold', bal > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                          {formatPKR(bal)}
                        </TableCell>
                      </TableRow>
                    )
                  }
                  if (purTab === 'date') {
                    return (
                      <TableRow key={r.id || i}>
                        <TableCell className="font-mono text-xs">{r.invoiceNumber}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(r.invoiceDate)}</TableCell>
                        <TableCell className="text-sm">{r.supplier?.name || '—'}</TableCell>
                        <TableCell className="text-right font-mono">{formatPKR(r.total)}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{formatPKR(r.paidAmount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs',
                            r.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                            r.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                            'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300')}>
                            {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  }
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right font-mono">{r.qty}</TableCell>
                      <TableCell className="text-right font-mono">{formatPKR(r.total)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </ReportTable>
          </TabsContent>
        </Tabs>
      )}

      {reportType === 'customers' && (
        <Tabs value={custTab} onValueChange={v => setCustTab(v as CustomersTab)} className="mb-4">
          <TabsList className="flex-wrap h-auto mb-4">
            <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
            <TabsTrigger value="credit">Credit</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>
          <TabsContent value={custTab}>
            {filteredRows.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                <StatCard label="Total Customers" value={viewRows.length} icon={Users} tone="info" />
                <StatCard label="With Outstanding" value={(viewRows as any[]).filter(r => r.outstanding > 0).length} icon={Wallet} tone="warning" />
                <StatCard label="Total Outstanding" value={formatPKR((viewRows as any[]).reduce((s, r) => s + Math.max(0, r.outstanding || 0), 0))} icon={Wallet} tone="danger" />
              </div>
            )}
            <ReportTable>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <SortableTh label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <th>Phone</th>
                  <SortableTh label="Total Sales" k="total" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <SortableTh label="Paid" k="paid" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <SortableTh label="Outstanding" k="outstanding" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r: any, i: number) => (
                  <TableRow key={r.id || i}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.phone || '—'}</TableCell>
                    <TableCell className="text-right font-mono">{formatPKR(r.total)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{formatPKR(r.paid)}</TableCell>
                    <TableCell className={cn('text-right font-mono font-semibold', r.outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                      {formatPKR(r.outstanding)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ReportTable>
          </TabsContent>
        </Tabs>
      )}

      {reportType === 'suppliers' && (
        <Tabs value={supTab} onValueChange={v => setSupTab(v as SuppliersTab)} className="mb-4">
          <TabsList className="flex-wrap h-auto mb-4">
            <TabsTrigger value="payables">Payables</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
          </TabsList>
          <TabsContent value={supTab}>
            {filteredRows.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                <StatCard label="Total Suppliers" value={viewRows.length} icon={Building2} tone="info" />
                <StatCard label="Total Payable" value={formatPKR((viewRows as any[]).reduce((s, r) => s + Math.max(0, r.payable || 0), 0))} icon={Wallet} tone="danger" />
                <StatCard label="Total Paid" value={formatPKR((viewRows as any[]).reduce((s, r) => s + (r.paid || 0), 0))} icon={Wallet} tone="success" />
              </div>
            )}
            <ReportTable>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <SortableTh label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <th className="hidden md:table-cell">Company</th>
                  <SortableTh label="Total" k="total" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <SortableTh label="Paid" k="paid" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <SortableTh label="Payable" k="payable" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r: any, i: number) => (
                  <TableRow key={r.id || i}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{r.company || '—'}</TableCell>
                    <TableCell className="text-right font-mono">{formatPKR(r.total)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{formatPKR(r.paid)}</TableCell>
                    <TableCell className={cn('text-right font-mono font-semibold', r.payable > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                      {formatPKR(r.payable)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ReportTable>
          </TabsContent>
        </Tabs>
      )}

      {reportType === 'expenses' && (
        <Tabs value={expTab} onValueChange={v => setExpTab(v as ExpensesTab)} className="mb-4">
          <TabsList className="flex-wrap h-auto mb-4">
            <TabsTrigger value="category">Category-wise</TabsTrigger>
            <TabsTrigger value="date">Date-wise</TabsTrigger>
          </TabsList>
          <TabsContent value={expTab}>
            {filteredRows.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-2 gap-3 mb-4">
                <StatCard label="Total Expenses" value={formatPKR((filteredRows as any[]).reduce((s, r) => s + (r.amount || 0), 0))} icon={Wallet} tone="danger" />
                <StatCard label="Categories" value={expTab === 'category' ? filteredRows.length : new Set((filteredRows as any[]).map(r => r.category)).size} icon={Boxes} tone="info" />
              </div>
            )}
            {expTab === 'category' && filteredRows.length > 0 && (
              <Card className="mb-4">
                <CardHeader className="pb-2 py-4">
                  <CardTitle className="text-sm">Expenses by category</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={filteredRows} dataKey="amount" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                        {filteredRows.map((_, i: number) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatPKR(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
            <ReportTable>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  {expTab === 'category' ? (
                    <>
                      <SortableTh label="Category" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Amount" k="amount" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                    </>
                  ) : (
                    <>
                      <SortableTh label="Date" k="date" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Category" k="category" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Amount" k="amount" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <th className="hidden md:table-cell">Description</th>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r: any, i: number) => (
                  <TableRow key={r.id || i}>
                    {expTab === 'category' ? (
                      <>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right font-mono text-red-600 dark:text-red-400 font-semibold">{formatPKR(r.amount)}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell className="font-medium">{r.category}</TableCell>
                        <TableCell className="text-right font-mono text-red-600 dark:text-red-400 font-semibold">{formatPKR(r.amount)}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{r.description || '—'}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </ReportTable>
          </TabsContent>
        </Tabs>
      )}

      {filteredRows.length === 0 && !loading && (
        <Card className="mt-4">
          <CardContent>
            <EmptyState
              icon={PackageX}
              title="No data for this report"
              description="Try changing the date range or sub-tab. If you expect data, ensure your pharmacy has activity in this period."
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ---------------- small sub-components ---------------- */

function ReportTable({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="max-h-[calc(100vh-360px)] overflow-auto scroll-area">
          <Table>
            {children}
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function SortableTh({
  label, k, sortKey, sortDir, onClick, align = 'left',
}: {
  label: string; k: string; sortKey: string; sortDir: 'asc' | 'desc';
  onClick: (k: string) => void; align?: 'left' | 'right'
}) {
  const active = sortKey === k
  return (
    <TableHead className={cn(align === 'right' && 'text-right')}>
      <button
        onClick={() => onClick(k)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          align === 'right' && 'flex-row-reverse',
          active && 'text-foreground',
        )}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-50" />
        )}
      </button>
    </TableHead>
  )
}
