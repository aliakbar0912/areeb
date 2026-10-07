'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader, formatPKR, formatCompactPKR, formatDateTime, EmptyState } from '@/components/ui-helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Printer, FileText, RefreshCw, ShoppingCart, Banknote, Wallet,
  TrendingUp, ArrowDownLeft, ArrowUpRight, Receipt, CreditCard, Loader2,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

interface ZReport {
  date: string
  pharmacy: { name: string; address: string; phone: string; currency: string }
  cashier: string
  summary: {
    totalSales: number
    totalDiscount: number
    totalTax: number
    totalPaid: number
    totalCredit: number
    totalReturns: number
    totalProfit: number
    totalExpenses: number
    totalCustomerPayments: number
    totalSupplierPayments: number
    totalPurchases: number
    invoiceCount: number
    cashSalesCount: number
    creditSalesCount: number
    partialSalesCount: number
    returnsCount: number
  }
  paymentBreakdown: Record<string, number>
  customerPaymentsByMethod: Record<string, number>
  expensesByCategory: Record<string, number>
  cashReconciliation: { cashIn: number; cashOut: number; netCashFlow: number }
  topItems: { name: string; qty: number; revenue: number }[]
  expenses: { category: string; amount: number; description: string | null; user: string | null }[]
  sales: { invoiceNumber: string; customer: string; total: number; paid: number; status: string; time: string; cashier: string | null }[]
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash', BANK: 'Bank Transfer', EASYPAISA: 'Easypaisa', JAZZCASH: 'JazzCash', OTHER: 'Other',
}

const EXPENSE_COLORS: Record<string, string> = {
  RENT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ELECTRICITY: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  SALARIES: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  INTERNET: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  TRANSPORT: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  MAINTENANCE: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  MISC: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
}

export function ZReportView() {
  const { hasPermission } = useAuth()
  const [report, setReport] = useState<ZReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/zreport?date=${date}`)
      if (r.ok) {
        const data = await r.json()
        setReport(data)
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { fetchReport() }, [fetchReport])

  const handlePrint = () => {
    if (!report) return
    const w = window.open('', '_blank', 'width=420,height=720')
    if (!w) return
    const html = generatePrintHTML(report)
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  if (!hasPermission('reports.view')) {
    return (
      <PageHeader title="End of Day Z-Report" subtitle="Access denied" />
    )
  }

  if (loading || !report) {
    return (
      <div>
        <PageHeader title="End of Day Z-Report" subtitle="Cashier reconciliation summary" />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  const { summary, pharmacy } = report
  const netCashPosition = summary.totalPaid - summary.totalExpenses - summary.totalSupplierPayments

  return (
    <div className="print-area">
      <PageHeader
        title="End of Day Z-Report"
        subtitle={`${pharmacy.name} • ${report.date} • Cashier: ${report.cashier}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={fetchReport}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
            <Button size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5 mr-1.5" /> Print Z-Report
            </Button>
          </>
        }
      />

      {/* Date selector with quick presets */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Label htmlFor="zr-date" className="text-xs shrink-0 font-semibold uppercase tracking-wider text-muted-foreground">Report Date:</Label>
        <Input
          id="zr-date"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="h-8 w-40"
        />
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setDate(new Date().toISOString().slice(0, 10))}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const d = new Date(); d.setDate(d.getDate() - 1)
              setDate(d.toISOString().slice(0, 10))
            }}
          >
            Yesterday
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const d = new Date(date); d.setDate(d.getDate() - 1)
              setDate(d.toISOString().slice(0, 10))
            }}
          >
            ← Prev Day
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const d = new Date(date); d.setDate(d.getDate() + 1)
              setDate(d.toISOString().slice(0, 10))
            }}
          >
            Next Day →
          </Button>
        </div>
      </div>

      {/* Top KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Sales</div>
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCompactPKR(summary.totalSales)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{summary.invoiceCount} invoices • {formatPKR(summary.totalSales)}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gross Profit</div>
          </div>
          <div className="text-xl font-bold text-sky-600 dark:text-sky-400">{formatCompactPKR(summary.totalProfit)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{formatPKR(summary.totalProfit)}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expenses</div>
          </div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{formatCompactPKR(summary.totalExpenses)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{formatPKR(summary.totalExpenses)}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Banknote className="h-4 w-4" />
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net Cash Flow</div>
          </div>
          <div className={`text-xl font-bold ${report.cashReconciliation.netCashFlow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCompactPKR(report.cashReconciliation.netCashFlow)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{formatPKR(report.cashReconciliation.netCashFlow)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Cash Reconciliation Card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" />
              Cash Reconciliation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 space-y-2 text-sm">
            <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <div className="flex items-center gap-2">
                <ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Cash In</span>
              </div>
              <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">{formatPKR(report.cashReconciliation.cashIn)}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span>Cash Out</span>
              </div>
              <span className="font-mono font-semibold text-red-700 dark:text-red-400">{formatPKR(report.cashReconciliation.cashOut)}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg border-2 border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2 font-semibold">
                <Banknote className="h-4 w-4 text-primary" />
                <span>Net Cash</span>
              </div>
              <span className={`font-mono font-bold ${report.cashReconciliation.netCashFlow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatPKR(report.cashReconciliation.netCashFlow)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods Breakdown */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Payment Methods Received
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 space-y-1.5">
            {Object.keys(report.paymentBreakdown).length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-4">No payments received today</div>
            )}
            {Object.entries(report.paymentBreakdown).map(([method, amount]) => (
              <div key={method} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent border">
                <Badge variant="outline" className="font-mono text-xs">{PAYMENT_LABELS[method] || method}</Badge>
                <span className="font-mono font-semibold text-sm">{formatPKR(amount)}</span>
              </div>
            ))}
            {Object.keys(report.customerPaymentsByMethod).length > 0 && (
              <div className="mt-3 pt-2 border-t">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">Credit Collections</div>
                {Object.entries(report.customerPaymentsByMethod).map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between p-1.5 text-xs">
                    <span className="text-muted-foreground">{PAYMENT_LABELS[method] || method}</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">+ {formatPKR(amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sales Summary Breakdown */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Sales Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 space-y-1.5 text-sm">
            <div className="flex justify-between p-2 rounded-lg hover:bg-accent">
              <span className="text-muted-foreground">Subtotal (pre-discount)</span>
              <span className="font-mono">{formatPKR(summary.totalSales + summary.totalDiscount)}</span>
            </div>
            <div className="flex justify-between p-2 rounded-lg text-amber-700 dark:text-amber-400">
              <span>Discounts Given</span>
              <span className="font-mono">- {formatPKR(summary.totalDiscount)}</span>
            </div>
            <div className="flex justify-between p-2 rounded-lg text-muted-foreground">
              <span>Tax Collected</span>
              <span className="font-mono">+ {formatPKR(summary.totalTax)}</span>
            </div>
            <div className="flex justify-between p-2 rounded-lg bg-primary/5 border font-bold">
              <span>Net Sales</span>
              <span className="font-mono text-primary">{formatPKR(summary.totalSales)}</span>
            </div>
            <div className="border-t pt-2 mt-2 space-y-1.5">
              <div className="flex justify-between p-1.5 text-xs">
                <span className="text-muted-foreground">Cash Sales</span>
                <Badge variant="default" className="font-mono text-[10px]">{summary.cashSalesCount}</Badge>
              </div>
              <div className="flex justify-between p-1.5 text-xs">
                <span className="text-muted-foreground">Credit Sales</span>
                <Badge variant="destructive" className="font-mono text-[10px]">{summary.creditSalesCount}</Badge>
              </div>
              <div className="flex justify-between p-1.5 text-xs">
                <span className="text-muted-foreground">Partial Paid</span>
                <Badge variant="secondary" className="font-mono text-[10px]">{summary.partialSalesCount}</Badge>
              </div>
              <div className="flex justify-between p-1.5 text-xs">
                <span className="text-muted-foreground">Outstanding Credit</span>
                <span className="font-mono text-red-600 dark:text-red-400">{formatPKR(summary.totalCredit)}</span>
              </div>
              <div className="flex justify-between p-1.5 text-xs">
                <span className="text-muted-foreground">Returns Today</span>
                <span className="font-mono text-red-600 dark:text-red-400">- {formatPKR(summary.totalReturns)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Items + Expenses by category row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              Top-Selling Items Today ({report.topItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.topItems.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No sales today</TableCell></TableRow>
                )}
                {report.topItems.map((it, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm">{it.name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{it.qty}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{formatPKR(it.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Expenses by Category
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {Object.keys(report.expensesByCategory).length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-6">No expenses today</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(report.expensesByCategory).map(([cat, amount]) => (
                  <div key={cat} className="flex items-center justify-between p-2 rounded-lg border">
                    <Badge className={`font-mono text-xs ${EXPENSE_COLORS[cat] || EXPENSE_COLORS.MISC}`}>{cat}</Badge>
                    <span className="font-mono font-semibold text-sm">{formatPKR(amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Invoices List */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Today's Invoices ({report.sales.length})</span>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-80 overflow-y-auto scroll-area">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-32">Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden sm:table-cell">Time</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.sales.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No sales today</TableCell></TableRow>
                )}
                {report.sales.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs font-semibold">{s.invoiceNumber}</TableCell>
                    <TableCell className="text-sm">{s.customer}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {new Date(s.time).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatPKR(s.total)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">{formatPKR(s.paid)}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={s.status === 'PAID' ? 'default' : s.status === 'PARTIAL' ? 'secondary' : 'destructive'}
                        className="text-[10px]"
                      >
                        {s.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function generatePrintHTML(r: ZReport): string {
  const rows = r.sales.map(s => `
    <tr>
      <td>${s.invoiceNumber}</td>
      <td>${s.customer}</td>
      <td style="text-align:right">${s.total.toFixed(0)}</td>
      <td style="text-align:right">${s.paid.toFixed(0)}</td>
      <td style="text-align:center">${s.status}</td>
    </tr>
  `).join('')
  const paymentRows = Object.entries(r.paymentBreakdown).map(([k, v]) => `
    <tr><td>${PAYMENT_LABELS[k] || k}</td><td style="text-align:right">${v.toFixed(0)}</td></tr>
  `).join('')
  const expenseRows = Object.entries(r.expensesByCategory).map(([k, v]) => `
    <tr><td>${k}</td><td style="text-align:right">${v.toFixed(0)}</td></tr>
  `).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Z-Report ${r.date}</title>
  <style>
    body { font-family: 'Courier New', monospace; padding: 12px; max-width: 320px; margin: 0 auto; font-size: 11px; }
    .center { text-align: center; }
    .right { text-align: right; }
    h1 { font-size: 14px; margin: 0; }
    h2 { font-size: 12px; margin: 12px 0 4px; border-bottom: 1px solid #000; padding-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    th { border-bottom: 1px solid #000; padding: 2px; font-size: 10px; text-align: left; }
    td { padding: 1px 2px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .total-row td { border-top: 1px solid #000; font-weight: bold; }
  </style></head><body>
    <div class="center">
      <h1>${r.pharmacy.name}</h1>
      <div>${r.pharmacy.address}</div>
      <div>${r.pharmacy.phone}</div>
    </div>
    <hr>
    <div><strong>Z-REPORT</strong> — End of Day</div>
    <div>Date: ${r.date}</div>
    <div>Cashier: ${r.cashier}</div>
    <hr>

    <h2>Sales Summary</h2>
    <table>
      <tr><td>Total Sales</td><td class="right">${r.pharmacy.currency} ${r.summary.totalSales.toFixed(0)}</td></tr>
      <tr><td>Discounts</td><td class="right">- ${r.summary.totalDiscount.toFixed(0)}</td></tr>
      <tr><td>Tax</td><td class="right">+ ${r.summary.totalTax.toFixed(0)}</td></tr>
      <tr class="total-row"><td>NET SALES</td><td class="right">${r.pharmacy.currency} ${r.summary.totalSales.toFixed(0)}</td></tr>
      <tr><td>Gross Profit</td><td class="right">${r.summary.totalProfit.toFixed(0)}</td></tr>
      <tr><td>Sales Returns</td><td class="right">- ${r.summary.totalReturns.toFixed(0)}</td></tr>
      <tr><td>Invoices Count</td><td class="right">${r.summary.invoiceCount}</td></tr>
    </table>

    <h2>Payment Methods</h2>
    <table>${paymentRows || '<tr><td colspan="2">None</td></tr>'}</table>

    <h2>Expenses by Category</h2>
    <table>${expenseRows || '<tr><td colspan="2">None</td></tr>'}</table>
    <tr class="total-row"><td>Total Expenses</td><td class="right">${r.pharmacy.currency} ${r.summary.totalExpenses.toFixed(0)}</td></tr>

    <h2>Cash Reconciliation</h2>
    <table>
      <tr><td>Cash In</td><td class="right">+ ${r.cashReconciliation.cashIn.toFixed(0)}</td></tr>
      <tr><td>Cash Out</td><td class="right">- ${r.cashReconciliation.cashOut.toFixed(0)}</td></tr>
      <tr class="total-row"><td>NET CASH</td><td class="right">${r.pharmacy.currency} ${r.cashReconciliation.netCashFlow.toFixed(0)}</td></tr>
    </table>

    <h2>Today's Invoices</h2>
    <table>
      <thead><tr><th>Inv</th><th>Customer</th><th class="right">Total</th><th class="right">Paid</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <hr>
    <div class="center">End of Z-Report • ${new Date().toLocaleString('en-PK')}</div>
    <div class="center" style="margin-top:6px;">___________________________</div>
    <div class="center" style="font-size:9px;">Cashier Signature</div>
    <script>window.onload = () => { window.print(); }</script>
  </body></html>`
}
