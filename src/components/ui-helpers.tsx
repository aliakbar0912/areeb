'use client'

import { cn } from '@/lib/utils'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { ReactNode } from 'react'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: any; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="font-semibold">{title}</div>
      {description && <div className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function StatCard({
  label, value, icon: Icon, hint, tone = 'default', onClick, trend, trendValue,
}: {
  label: string; value: string | number; icon: any;
  hint?: string; tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'; onClick?: () => void;
  trend?: 'up' | 'down' | 'flat'; trendValue?: string;
}) {
  const toneCls: Record<string, string> = {
    default: 'text-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
    info: 'text-sky-600 dark:text-sky-400',
  }
  const iconBg: Record<string, string> = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    info: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  }
  const trendCls: Record<string, string> = {
    up: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
    down: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
    flat: 'text-muted-foreground bg-muted',
  }
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'group relative flex items-start gap-3 p-4 rounded-xl border bg-card text-left transition-all shadow-sm hover:shadow-md',
        onClick && 'hover:border-primary/40 cursor-pointer',
      )}
    >
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg shrink-0', iconBg[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-semibold text-muted-foreground/90 uppercase tracking-wider truncate">{label}</div>
        <div className={cn('text-lg lg:text-xl font-bold leading-tight mt-0.5 break-words', toneCls[tone])}>{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">{hint}</div>}
      </div>
      {trend && trendValue && (
        <div className={cn('absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-0.5', trendCls[trend])}>
          {trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'} {trendValue}
        </div>
      )}
    </button>
  )
}

export function AlertPill({ severity, children }: { severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'success'; children: ReactNode }) {
  const cls: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-900',
    WARNING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-900',
    INFO: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-900',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  }
  const icon = severity === 'CRITICAL' ? XCircle : severity === 'WARNING' ? AlertTriangle : severity === 'success' ? CheckCircle2 : Info
  const Icon = icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cls[severity])}>
      <Icon className="h-3 w-3" />
      {children}
    </span>
  )
}

export function formatPKR(n: number | undefined | null) {
  if (n == null || isNaN(Number(n))) return 'Rs 0'
  const v = Number(n)
  const abs = Math.abs(v)
  return `Rs ${abs.toLocaleString('en-PK', { maximumFractionDigits: 0 })}${v < 0 ? ' (cr)' : ''}`
}

// Compact format for tight spaces (KPI cards, charts): 1.2K, 3.4M, etc.
export function formatCompactPKR(n: number | undefined | null) {
  if (n == null || isNaN(Number(n))) return 'Rs 0'
  const v = Number(n)
  const abs = Math.abs(v)
  let s: string
  if (abs >= 10000000) s = (abs / 10000000).toFixed(2).replace(/\.?0+$/, '') + ' Cr'
  else if (abs >= 100000) s = (abs / 100000).toFixed(2).replace(/\.?0+$/, '') + ' Lakh'
  else if (abs >= 1000) s = (abs / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  else s = abs.toLocaleString('en-PK', { maximumFractionDigits: 0 })
  return `${v < 0 ? '-' : ''}Rs ${s}`
}

// Format a numeric quantity with rounding to avoid float precision bugs like 4.800000000000001
export function formatQty(n: number | undefined | null, decimals = 0) {
  if (n == null || isNaN(Number(n))) return '0'
  return Number(n).toFixed(decimals).replace(/\.?0+$/, '')
}

export function formatDate(d: string | Date | undefined) {
  if (!d) return '-'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(d: string | Date | undefined) {
  if (!d) return '-'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function useFetch<T = any>(url: string, deps: any[] = []) {
  // simple fetch hook used across views
}

export { cn }
