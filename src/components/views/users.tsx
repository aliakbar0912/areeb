'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  PageHeader, StatCard, EmptyState, formatDateTime, formatDate, cn,
} from '@/components/ui-helpers'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  UserPlus, Users, Pencil, Trash2, Search, Loader2, ShieldCheck, Mail,
  Phone, User as UserIcon, Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

interface UserRow {
  id: string
  email: string
  name: string
  phone?: string | null
  role: string // role name
  roleId: string
  isActive: boolean
  lastLoginAt?: string | null
  createdAt: string
}

interface RoleRow {
  id: string
  name: string
  description?: string | null
  isSystem: boolean
  permissions: string[]
  usersCount: number
}

const ROLE_TONE: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-900',
  MANAGER: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  CASHIER: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-900',
}

function roleBadgeClass(name: string) {
  const key = (name || '').toUpperCase()
  return ROLE_TONE[key] || 'bg-muted text-muted-foreground border-border'
}

function initials(name: string) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '??'
}

interface FormState {
  name: string
  email: string
  phone: string
  password: string
  roleId: string
  isActive: boolean
}

const emptyForm: FormState = { name: '', email: '', phone: '', password: '', roleId: '', isActive: true }

export function UsersView() {
  const { hasPermission, user: currentUser } = useAuth()
  const canManage = hasPermission('users.manage')

  const [users, setUsers] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [u, r] = await Promise.all([
        fetch('/api/users').then(r => r.json()),
        fetch('/api/roles').then(r => r.json()),
      ])
      setUsers(u.users || [])
      setRoles(r.roles || [])
    } catch (e: any) {
      toast.error(e.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canManage) load()
    else setLoading(false)
  }, [canManage, load])

  const filtered = useMemo(() => {
    if (!search) return users
    const q = search.toLowerCase()
    return users.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    )
  }, [users, search])

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.isActive).length,
    inactive: users.filter(u => !u.isActive).length,
    rolesUsed: new Set(users.map(u => u.role)).size,
  }), [users])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm, roleId: roles[0]?.id || '' })
    setFormOpen(true)
  }

  const openEdit = (u: UserRow) => {
    setEditing(u)
    setForm({
      name: u.name,
      email: u.email,
      phone: u.phone || '',
      password: '',
      roleId: u.roleId,
      isActive: u.isActive,
    })
    setFormOpen(true)
  }

  const submitForm = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (!form.email.trim()) { toast.error('Email is required'); return }
    if (!form.roleId) { toast.error('Role is required'); return }
    if (!editing && !form.password) { toast.error('Password is required for new users'); return }
    setSubmitting(true)
    try {
      const body: any = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        roleId: form.roleId,
        isActive: form.isActive,
      }
      if (form.password) body.password = form.password
      const url = editing ? '/api/users' : '/api/users'
      const method = editing ? 'PUT' : 'POST'
      if (editing) body.id = editing.id
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to save')
      toast.success(editing ? 'User updated' : 'User added')
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
    if (deleteTarget.id === currentUser?.id) {
      toast.error('You cannot delete your own account')
      setDeleteTarget(null)
      return
    }
    setDeleting(true)
    try {
      const r = await fetch(`/api/users?id=${deleteTarget.id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Delete failed')
      toast.success('User deleted')
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
        <PageHeader title="User Management" subtitle="Manage pharmacy staff accounts" />
        <EmptyState icon={Users} title="Access denied" description="You do not have permission to manage users." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Manage pharmacy staff accounts"
        actions={
          <Button onClick={openAdd}>
            <UserPlus className="h-4 w-4" /> Add User
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Users" value={stats.total} icon={Users} tone="info" />
        <StatCard label="Active" value={stats.active} icon={ShieldCheck} tone="success" />
        <StatCard label="Inactive" value={stats.inactive} icon={UserIcon} tone="warning" />
        <StatCard label="Roles in Use" value={stats.rolesUsed} icon={Lock} tone="default" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="p-3 border-b">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone, role…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users found"
              description={search ? 'Try a different search term.' : 'Add your first user to get started.'}
              action={<Button onClick={openAdd}><UserPlus className="h-4 w-4" /> Add User</Button>}
            />
          ) : (
            <div className="max-h-[calc(100vh-340px)] overflow-y-auto scroll-area">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="min-w-48">Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Last Login</TableHead>
                    <TableHead className="hidden lg:table-cell">Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(u => {
                    const isSelf = currentUser?.id === u.id
                    return (
                      <TableRow key={u.id} className={cn(!u.isActive && 'opacity-60')}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                                {initials(u.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">
                                {u.name}
                                {isSelf && <Badge variant="outline" className="ml-2 text-xs">You</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground truncate md:hidden">{u.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{u.email}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{u.phone || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs font-medium', roleBadgeClass(u.role))}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {u.isActive ? (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900 text-xs">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {formatDate(u.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(u)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setDeleteTarget(u)}
                              disabled={isSelf}
                              title={isSelf ? 'Cannot delete yourself' : 'Delete'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

      {/* Add/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              {editing ? 'Edit User' : 'Add User'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? `Update ${editing.name}'s details. Leave password blank to keep the current one.`
                : 'Create a new staff account. They will be able to log in immediately.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-1">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  className="pl-9"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="name@pharmacy.pk"
                  disabled={!!editing}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="03xx-xxxxxxx"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={form.roleId} onValueChange={v => setForm({ ...form, roleId: v })}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}{r.isSystem ? ' (system)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>
                Password {editing ? <span className="text-xs text-muted-foreground">(leave blank to keep current)</span> : ' *'}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  className="pl-9"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder={editing ? '••••••••' : 'Minimum 8 characters'}
                />
              </div>
            </div>
            <div className="md:col-span-2 flex items-center justify-between gap-3 pt-2 border-t">
              <div>
                <Label className="text-sm font-medium">Active account</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Inactive users cannot sign in.</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={submitForm} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Add User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}).
              Their associated sales, purchases, and audit log entries will remain but the user record will be removed.
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
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
