'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { PageHeader, EmptyState, cn, formatDateTime } from '@/components/ui-helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DatabaseBackup, Download, Upload, AlertTriangle, RotateCcw, FileJson,
  Loader2, ShieldAlert, CheckCircle2, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

interface ParsedBackup {
  timestamp?: string
  version?: number
  medicines?: any[]
  batches?: any[]
  suppliers?: any[]
  customers?: any[]
  sales?: any[]
  purchases?: any[]
  expenses?: any[]
  payments?: any[]
  settings?: any[]
  users?: any[]
  roles?: any[]
  auditLogs?: any[]
  supplierPayments?: any[]
}

export function BackupView() {
  const { hasPermission } = useAuth()
  const canUse = hasPermission('backup.use')

  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const [parsed, setParsed] = useState<ParsedBackup | null>(null)
  const [fileName, setFileName] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [parseError, setParseError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Factory reset state
  const [resetOpen, setResetOpen] = useState(false)
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetting, setResetting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/settings')
      if (r.ok) {
        const d = await r.json()
        setSettings(d.settings || {})
      }
    } catch {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canUse) load()
    else setLoading(false)
  }, [canUse, load])

  const lastRun = settings['backup.lastRun'] || ''
  const autoEnabled = settings['backup.autoEnabled'] === 'true' || settings['backup.autoEnabled'] === '1'

  const createBackup = async () => {
    setCreating(true)
    try {
      const r = await fetch('/api/backup')
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || 'Backup failed')
      }
      // Trigger download from the JSON response
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Try to get filename from Content-Disposition, fallback to generated name
      const disp = r.headers.get('Content-Disposition') || ''
      const m = /filename="?([^"]+)"?/.exec(disp)
      a.download = m?.[1] || `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup downloaded')
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Backup failed')
    } finally {
      setCreating(false)
    }
  }

  const toggleAuto = async (on: boolean) => {
    try {
      const r = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'backup.autoEnabled': on ? 'true' : 'false' }),
      })
      if (!r.ok) throw new Error('Failed to update')
      setSettings(s => ({ ...s, 'backup.autoEnabled': on ? 'true' : 'false' }))
      toast.success(`Auto-backup ${on ? 'enabled' : 'disabled'}`)
    } catch (e: any) {
      toast.error(e.message || 'Failed to update')
    }
  }

  const onFile = async (file: File | null) => {
    if (!file) return
    setFileName(file.name)
    setParseError('')
    setParsed(null)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (typeof data !== 'object' || data === null) throw new Error('Invalid backup file')
      setParsed(data as ParsedBackup)
      toast.success(`Parsed ${file.name}`)
    } catch (e: any) {
      setParseError(e.message || 'Invalid JSON file')
      toast.error('Could not parse backup file')
    }
  }

  const restoreSettings = async () => {
    if (!parsed?.settings || !Array.isArray(parsed.settings)) {
      toast.error('No settings array found in backup')
      return
    }
    setRestoring(true)
    try {
      const r = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, settings: parsed.settings }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Restore failed')
      toast.success('Settings restored from backup')
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  const factoryReset = async () => {
    setResetting(true)
    try {
      const r = await fetch('/api/backup', { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Reset failed')
      toast.success('Factory reset complete. Please log in again.')
      setResetOpen(false)
      setResetConfirm('')
      // Force reload to login page
      setTimeout(() => window.location.reload(), 1200)
    } catch (e: any) {
      toast.error(e.message || 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  if (!canUse) {
    return (
      <div>
        <PageHeader title="Backup & Restore" subtitle="Database backup management" />
        <EmptyState icon={DatabaseBackup} title="Access denied" description="You do not have permission to use backup & restore." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Backup & Restore" subtitle="Database backup management" />

      {/* Warning card */}
      <Card className="mb-5 border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-900/10">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-200">Backups protect your business data</div>
            <p className="text-amber-800/80 dark:text-amber-300/80 mt-1">
              Regularly download JSON backups of medicines, sales, purchases, customers, suppliers, expenses, and settings.
              Store them somewhere safe (offline USB, cloud drive). Restore settings only — transactional restore is intentionally not provided to prevent accidental data loss.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Backup section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DatabaseBackup className="h-5 w-5 text-primary" />
              Create Backup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-8 w-2/3" />
              </div>
            ) : (
              <>
                <Button onClick={createBackup} disabled={creating} className="w-full">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Create Backup
                </Button>
                <p className="text-xs text-muted-foreground">
                  Downloads a full JSON snapshot of your database (passwords redacted). Saves a record in the backup log.
                </p>

                <div className="rounded-lg border p-3 bg-muted/30">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Last backup:</span>
                    <span className="font-medium">{lastRun ? formatDateTime(lastRun) : 'Never'}</span>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="auto-backup" className="text-sm font-medium">Auto-backup</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Enable automatic scheduled backups (UI toggle for now).</p>
                  </div>
                  <Switch
                    id="auto-backup"
                    checked={autoEnabled}
                    onCheckedChange={toggleAuto}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Restore section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Restore Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Backup file (.json)</Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                onChange={e => onFile(e.target.files?.[0] || null)}
              />
              {fileName && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                  <FileJson className="h-3.5 w-3.5" />
                  {fileName}
                </div>
              )}
              {parseError && (
                <div className="text-xs text-red-600 dark:text-red-400 mt-1">{parseError}</div>
              )}
            </div>

            {parsed && (
              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <FileJson className="h-4 w-4 text-primary" />
                  Backup preview
                  {parsed.timestamp && (
                    <span className="text-xs text-muted-foreground font-normal ml-auto">
                      {formatDateTime(parsed.timestamp)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <PreviewRow label="Medicines" count={parsed.medicines?.length} />
                  <PreviewRow label="Batches" count={parsed.batches?.length} />
                  <PreviewRow label="Sales" count={parsed.sales?.length} />
                  <PreviewRow label="Purchases" count={parsed.purchases?.length} />
                  <PreviewRow label="Customers" count={parsed.customers?.length} />
                  <PreviewRow label="Suppliers" count={parsed.suppliers?.length} />
                  <PreviewRow label="Expenses" count={parsed.expenses?.length} />
                  <PreviewRow label="Settings" count={parsed.settings?.length} />
                  <PreviewRow label="Users" count={parsed.users?.length} />
                  <PreviewRow label="Roles" count={parsed.roles?.length} />
                </div>
              </div>
            )}

            <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-900/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Restoring settings will overwrite current settings. This action cannot be undone.</strong>
                <div className="mt-1 opacity-90">Only settings are restored — medicines, sales, purchases, and other transactions are NOT restored.</div>
              </div>
            </div>

            <Button
              variant="secondary"
              className="w-full"
              disabled={!parsed?.settings || restoring}
              onClick={restoreSettings}
            >
              {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Restore Settings Only
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Factory Reset section */}
      <Card className="mt-5 border-2 border-red-300 dark:border-red-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
            <ShieldAlert className="h-5 w-5" />
            Danger Zone — Factory Reset
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10 p-3 text-sm text-red-800 dark:text-red-300">
            <strong>This will permanently delete ALL medicines, sales, purchases, customers, suppliers, expenses, and settings.</strong>
            <div className="mt-1">Only the default admin user will remain. This action <strong>CANNOT</strong> be undone.</div>
          </div>

          <AlertDialog open={resetOpen} onOpenChange={open => {
            setResetOpen(open)
            if (!open) setResetConfirm('')
          }}>
            <Button variant="destructive" onClick={() => setResetOpen(true)} className="w-full">
              <RotateCcw className="h-4 w-4" />
              Factory Reset
            </Button>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-red-700 dark:text-red-400 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5" />
                  Confirm Factory Reset
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>ALL</strong> medicines, sales, purchases, customers, suppliers,
                  expenses, and settings. Only the default admin user will remain. This action <strong>CANNOT</strong> be undone.
                  <div className="mt-3 text-xs">
                    To confirm, type <strong className="font-mono bg-muted px-1.5 py-0.5 rounded">RESET</strong> below:
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={resetConfirm}
                onChange={e => setResetConfirm(e.target.value)}
                placeholder="Type RESET to confirm"
                className="font-mono"
              />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={factoryReset}
                  disabled={resetting || resetConfirm.trim() !== 'RESET'}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Reset Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            After reset you will be signed out and the default admin credentials will be{' '}
            <Badge variant="outline" className="font-mono text-xs">admin@pharmacy.pk / admin123</Badge>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function PreviewRow({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 rounded bg-background/60 border">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-mono font-semibold', count && count > 0 ? 'text-foreground' : 'text-muted-foreground')}>
        {count ?? 0}
      </span>
    </div>
  )
}
