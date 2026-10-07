'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  PageHeader, StatCard, EmptyState, cn,
} from '@/components/ui-helpers'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Shield, ShieldCheck, UserCog, Plus, Pencil, Trash2, Loader2, Lock, CheckSquare, Square,
  LayoutDashboard, Boxes, Truck, ShoppingCart, Wallet, Settings,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

interface RoleRow {
  id: string
  name: string
  description?: string | null
  isSystem: boolean
  permissions: string[]
  usersCount: number
}

type AvailableMap = Record<string, string>

interface PermGroup {
  name: string
  icon: any
  keys: string[]
}

const PERM_GROUPS: PermGroup[] = [
  {
    name: 'Operations', icon: LayoutDashboard,
    keys: ['dashboard.view', 'pos.use', 'notifications.view', 'search.use'],
  },
  {
    name: 'Inventory', icon: Boxes,
    keys: ['inventory.view', 'inventory.edit', 'inventory.delete', 'stock.view', 'expiry.view'],
  },
  {
    name: 'Purchases', icon: Truck,
    keys: ['purchases.view', 'purchases.edit', 'purchases.return', 'suppliers.view', 'suppliers.edit'],
  },
  {
    name: 'Sales', icon: ShoppingCart,
    keys: ['customers.view', 'customers.edit', 'credit.view', 'credit.payment', 'sales.return'],
  },
  {
    name: 'Finance', icon: Wallet,
    keys: ['expenses.view', 'expenses.edit', 'reports.view', 'owner.view'],
  },
  {
    name: 'Admin', icon: Settings,
    keys: ['audit.view', 'backup.use', 'settings.view', 'settings.edit', 'users.manage'],
  },
]

const ROLE_TONE: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-900',
  MANAGER: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  CASHIER: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-900',
}

interface FormState {
  name: string
  description: string
  permissions: string[]
}

const emptyForm: FormState = { name: '', description: '', permissions: [] }

export function RolesView() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('users.manage')

  const [roles, setRoles] = useState<RoleRow[]>([])
  const [available, setAvailable] = useState<AvailableMap>({})
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/roles')
      const d = await r.json()
      setRoles(d.roles || [])
      setAvailable(d.available || {})
    } catch (e: any) {
      toast.error(e.message || 'Failed to load roles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canManage) load()
    else setLoading(false)
  }, [canManage, load])

  const stats = useMemo(() => ({
    total: roles.length,
    system: roles.filter(r => r.isSystem).length,
    custom: roles.filter(r => !r.isSystem).length,
    totalPermissions: roles.reduce((s, r) => s + (r.permissions?.length || 0), 0),
  }), [roles])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  const openEdit = (r: RoleRow) => {
    setEditing(r)
    setForm({
      name: r.name,
      description: r.description || '',
      permissions: Array.isArray(r.permissions) ? [...r.permissions] : [],
    })
    setFormOpen(true)
  }

  const togglePerm = (key: string) => {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter(p => p !== key)
        : [...prev.permissions, key],
    }))
  }

  const setGroup = (group: PermGroup, on: boolean) => {
    setForm(prev => {
      let perms = prev.permissions.filter(p => !group.keys.includes(p))
      if (on) perms = [...perms, ...group.keys]
      return { ...prev, permissions: perms }
    })
  }

  const submitForm = async () => {
    if (!form.name.trim()) { toast.error('Role name is required'); return }
    setSubmitting(true)
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        permissions: form.permissions,
      }
      const url = '/api/roles'
      const method = editing ? 'PUT' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...body, id: editing.id } : body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to save')
      toast.success(editing ? 'Role updated' : 'Role created')
      setFormOpen(false)
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const r = await fetch(`/api/roles?id=${deleteTarget.id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Delete failed')
      toast.success('Role deleted')
      setDeleteTarget(null)
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Roles & Permissions" subtitle="Manage role-based access control" />
        <EmptyState icon={Shield} title="Access denied" description="You do not have permission to manage roles." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Manage role-based access control"
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Role
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Roles" value={stats.total} icon={Shield} tone="info" />
        <StatCard label="System Roles" value={stats.system} icon={Lock} tone="warning" hint="Cannot be deleted" />
        <StatCard label="Custom Roles" value={stats.custom} icon={ShieldCheck} tone="success" />
        <StatCard label="Permissions Granted" value={stats.totalPermissions} icon={CheckSquare} tone="default" hint="Across all roles" />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      ) : roles.length === 0 ? (
        <EmptyState icon={Shield} title="No roles found" action={<Button onClick={openAdd}><Plus className="h-4 w-4" /> Add Role</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map(r => {
            const RoleIcon = (ROLE_TONE[(r.name || '').toUpperCase()] ? UserCog : Shield) as any
            const groupCounts = PERM_GROUPS.map(g => ({
              name: g.name,
              set: g.keys.filter(k => r.permissions?.includes(k)).length,
              total: g.keys.length,
            }))
            return (
              <Card key={r.id} className="flex flex-col">
                <CardContent className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
                        r.isSystem
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-primary/10 text-primary',
                      )}>
                        <RoleIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate flex items-center gap-1.5">
                          {r.name}
                          {r.isSystem && (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-900">
                              <Lock className="h-2.5 w-2.5" /> system
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.permissions?.length || 0} permissions
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {r.usersCount} user{r.usersCount === 1 ? '' : 's'}
                    </Badge>
                  </div>

                  {r.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>
                  )}

                  <Separator />

                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {groupCounts.map(g => (
                      <div key={g.name} className="flex items-center justify-between px-2 py-1 rounded bg-muted/40">
                        <span className="text-muted-foreground">{g.name}</span>
                        <span className={cn('font-mono', g.set === g.total ? 'text-emerald-600 dark:text-emerald-400' : g.set === 0 ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400')}>
                          {g.set}/{g.total}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-end gap-1 mt-auto pt-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={r.isSystem}
                      onClick={() => setDeleteTarget(r)}
                      title={r.isSystem ? 'System roles cannot be deleted' : 'Delete role'}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add/Edit Role dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              {editing ? `Edit Role — ${editing.name}` : 'Add Role'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modify role details and permissions. System roles cannot be renamed.'
                : 'Create a new custom role with a tailored permission set.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-1">
            <div className="space-y-1.5">
              <Label>Role Name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. PHARMACIST"
                disabled={!!editing?.isSystem}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Users in this role</Label>
              <Input value={editing ? String(editing.usersCount) : '0 (new role)'} disabled />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="What this role is for (e.g. Counter sales & credit collection)"
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Permission Matrix</Label>
            <Badge variant="outline" className="text-xs">{form.permissions.length} selected</Badge>
          </div>

          <ScrollArea className="h-[320px] rounded-lg border p-3">
            <div className="space-y-4 pr-2">
              {PERM_GROUPS.map(group => {
                const GroupIcon = group.icon
                const allOn = group.keys.every(k => form.permissions.includes(k))
                const someOn = group.keys.some(k => form.permissions.includes(k))
                return (
                  <div key={group.name} className="rounded-lg border bg-card">
                    <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <GroupIcon className="h-4 w-4 text-primary" />
                        {group.name}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setGroup(group, true)}
                        >
                          <CheckSquare className="h-3 w-3" /> Select all
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setGroup(group, false)}
                        >
                          <Square className="h-3 w-3" /> Clear
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 p-2">
                      {group.keys.map(key => (
                        <label
                          key={key}
                          className={cn(
                            'flex items-start gap-2 p-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors',
                            form.permissions.includes(key) && 'bg-accent/30',
                          )}
                        >
                          <Checkbox
                            checked={form.permissions.includes(key)}
                            onCheckedChange={() => togglePerm(key)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{available[key] || key}</div>
                            <div className="text-xs text-muted-foreground font-mono">{key}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    {someOn && !allOn && (
                      <div className="px-3 py-1 text-xs text-amber-600 dark:text-amber-400 border-t">
                        {group.keys.filter(k => form.permissions.includes(k)).length} of {group.keys.length} selected
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>

          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={submitForm} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the role <strong>{deleteTarget?.name}</strong>.
              {deleteTarget && deleteTarget.usersCount > 0 && (
                <span className="block mt-1 text-red-600 dark:text-red-400">
                  {deleteTarget.usersCount} user(s) are currently assigned to this role — reassign or delete them first.
                </span>
              )}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
