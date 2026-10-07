'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  PageHeader, EmptyState, formatDateTime, cn,
} from '@/components/ui-helpers'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Shield, Search, Download, Loader2, Activity, User, Eye, RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

interface AuditLog {
  id: string
  action: string
  entity?: string | null
  entityId?: string | null
  details?: string | null
  ipAddress?: string | null
  createdAt: string
  user?: { name: string; email: string } | null
}

function actionTone(action: string): 'success' | 'warning' | 'danger' | 'info' {
  const a = action.toUpperCase()
  if (a.includes('DELETE') || a.includes('DEACTIVATE') || a.includes('REMOVE') || a.includes('RESET')) return 'danger'
  if (a.includes('UPDATE') || a.includes('EDIT') || a.includes('CHANGE')) return 'warning'
  if (a.includes('CREATE') || a.includes('LOGIN') || a.includes('SUCCESS') || a.includes('ADD')) return 'success'
  return 'info'
}

const TONE_CLS: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-900',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-900',
}

const LIMITS = [50, 100, 200]

function initials(name?: string) {
  if (!name) return '??'
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '??'
}

function csvEscape(v: any): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function AuditView() {
  const { hasPermission } = useAuth()
  const canView = hasPermission('audit.view')

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [action, setAction] = useState('')
  const [limit, setLimit] = useState(100)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      if (action.trim()) params.set('action', action.trim())
      const r = await fetch(`/api/audit?${params.toString()}`)
      if (!r.ok) throw new Error('Failed to load audit log')
      const d = await r.json()
      setLogs(d.logs || [])
    } catch (e: any) {
      toast.error(e.message || 'Failed to load audit log')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [limit, action])

  useEffect(() => {
    if (canView) load()
    else setLoading(false)
  }, [canView, load])

  // auto-refresh every 60s
  useEffect(() => {
    if (!canView) return
    const t = setInterval(() => load(true), 60_000)
    return () => clearInterval(t)
  }, [canView, load])

  const filtered = useMemo(() => {
    let list = logs
    if (from) {
      const f = new Date(from + 'T00:00:00')
      list = list.filter(l => new Date(l.createdAt) >= f)
    }
    if (to) {
      const t = new Date(to + 'T23:59:59')
      list = list.filter(l => new Date(l.createdAt) <= t)
    }
    return list
  }, [logs, from, to])

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error('Nothing to export')
      return
    }
    const headers = ['Time', 'User Name', 'User Email', 'Action', 'Entity', 'Entity ID', 'Details', 'IP Address']
    const rows = filtered.map(l => [
      formatDateTime(l.createdAt),
      l.user?.name || '',
      l.user?.email || '',
      l.action,
      l.entity || '',
      l.entityId || '',
      l.details || '',
      l.ipAddress || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${filtered.length} entries`)
  }

  if (!canView) {
    return (
      <div>
        <PageHeader title="Audit Log" subtitle="Complete activity tracking" />
        <EmptyState icon={Shield} title="Access denied" description="You do not have permission to view the audit log." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Complete activity tracking"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => load(false)} disabled={refreshing || loading}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Action search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={action}
                  onChange={e => setAction(e.target.value)}
                  placeholder="LOGIN, MEDICINE_CREATE…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From date</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To date</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Limit</Label>
              <Select value={String(limit)} onValueChange={v => setLimit(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIMITS.map(n => <SelectItem key={n} value={String(n)}>{n} entries</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No audit entries"
              description="Try adjusting your filters or limit."
            />
          ) : (
            <div className="max-h-[calc(100vh-360px)] overflow-y-auto scroll-area">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-44">Time</TableHead>
                    <TableHead className="min-w-48">User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="hidden md:table-cell">Entity</TableHead>
                    <TableHead className="min-w-56">Details</TableHead>
                    <TableHead className="hidden lg:table-cell">IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(l => {
                    const tone = actionTone(l.action)
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                          {formatDateTime(l.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                              {initials(l.user?.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{l.user?.name || 'System'}</div>
                              <div className="text-xs text-muted-foreground truncate">{l.user?.email || '—'}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('font-mono text-xs', TONE_CLS[tone])}>
                            {l.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {l.entity ? (
                            <span className="inline-flex items-center gap-1">
                              <Eye className="h-3 w-3 text-muted-foreground" />
                              {l.entity}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="max-w-xs truncate" title={l.details || ''}>
                            {l.details || '—'}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground font-mono">
                          {l.ipAddress || '—'}
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

      <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
        <User className="h-3.5 w-3.5" />
        Showing <strong>{filtered.length}</strong> of <strong>{logs.length}</strong> fetched entries. Auto-refreshes every 60 seconds.
      </div>
    </div>
  )
}
