'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export type ViewKey =
  | 'dashboard' | 'pos' | 'scan' | 'inventory' | 'stock' | 'expiry'
  | 'purchases' | 'draft-pos' | 'purchase-returns' | 'suppliers'
  | 'customers' | 'credit' | 'loyalty' | 'sales-returns'
  | 'expenses' | 'reports' | 'owner' | 'zreport'
  | 'notifications' | 'audit' | 'backup' | 'settings'
  | 'users' | 'roles' | 'search'

interface NavCtx {
  view: ViewKey
  setView: (v: ViewKey) => void
  // optional context payload, e.g. a customerId when navigating from dashboard to customers
  payload: any
  navigate: (v: ViewKey, payload?: any) => void
}

const Ctx = createContext<NavCtx>(null as unknown as NavCtx)

export function NavProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewKey>('dashboard')
  const [payload, setPayload] = useState<any>(null)
  const navigate = useCallback((v: ViewKey, p?: any) => {
    setView(v)
    setPayload(p ?? null)
  }, [])
  return <Ctx.Provider value={{ view, setView, payload, navigate }}>{children}</Ctx.Provider>
}

export function useNav() { return useContext(Ctx) }
