'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

export type PermissionKey = string
export type ViewKey =
  | 'dashboard' | 'pos' | 'inventory' | 'stock' | 'expiry'
  | 'purchases' | 'purchase-returns' | 'suppliers'
  | 'customers' | 'credit' | 'sales-returns'
  | 'expenses' | 'reports' | 'owner'
  | 'notifications' | 'search' | 'audit' | 'backup' | 'settings'
  | 'users' | 'roles' | 'login'

export interface User {
  id: string
  email: string
  name: string
  phone?: string
  role: string
  roleId: string
  permissions: string[]
  isActive: boolean
  lastLoginAt?: string | null
}

interface AuthCtx {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  hasPermission: (key: PermissionKey) => boolean
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me')
      if (!r.ok) { setUser(null); return }
      const data = await r.json()
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const r = await fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      return { ok: false, error: d.error || 'Login failed' }
    }
    await refresh()
    return { ok: true }
  }, [refresh])

  const logout = useCallback(async () => {
    await fetch('/api/auth', { method: 'DELETE' })
    setUser(null)
  }, [])

  const hasPermission = useCallback((key: PermissionKey) => {
    if (!user) return false
    return user.permissions.includes(key)
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  return <Ctx.Provider value={{ user, loading, refresh, login, logout, hasPermission }}>{children}</Ctx.Provider>
}

export function useAuth() { return useContext(Ctx) }
