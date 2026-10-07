'use client'

import { AuthProvider, useAuth } from '@/lib/auth-context'
import { NavProvider, useNav } from '@/lib/nav-context'
import { Login } from '@/components/login'
import { AppShell } from '@/components/app-shell'
import { DashboardView } from '@/components/views/dashboard'
import { PosView } from '@/components/views/pos'
import { ScanMedicineView } from '@/components/views/scan-medicine'
import { InventoryView } from '@/components/views/inventory'
import { StockView } from '@/components/views/stock'
import { ExpiryView } from '@/components/views/expiry'
import { PurchasesView } from '@/components/views/purchases'
import { DraftPOsView } from '@/components/views/draft-pos'
import { PurchaseReturnsView } from '@/components/views/purchase-returns'
import { SalesReturnsView } from '@/components/views/sales-returns'
import { SuppliersView } from '@/components/views/suppliers'
import { CustomersView } from '@/components/views/customers'
import { LoyaltyView } from '@/components/views/loyalty'
import { CreditView } from '@/components/views/credit'
import { ExpensesView } from '@/components/views/expenses'
import { ReportsView } from '@/components/views/reports'
import { OwnerView } from '@/components/views/owner'
import { ZReportView } from '@/components/views/zreport'
import { NotificationsView } from '@/components/views/notifications'
import { AuditView } from '@/components/views/audit'
import { BackupView } from '@/components/views/backup'
import { SettingsView } from '@/components/views/settings'
import { UsersView } from '@/components/views/users'
import { RolesView } from '@/components/views/roles'
import { Loader2 } from 'lucide-react'

function MainView() {
  const { view } = useNav()
  switch (view) {
    case 'dashboard': return <DashboardView />
    case 'pos': return <PosView />
    case 'scan': return <ScanMedicineView />
    case 'inventory': return <InventoryView />
    case 'stock': return <StockView />
    case 'expiry': return <ExpiryView />
    case 'purchases': return <PurchasesView />
    case 'draft-pos': return <DraftPOsView />
    case 'purchase-returns': return <PurchaseReturnsView />
    case 'sales-returns': return <SalesReturnsView />
    case 'suppliers': return <SuppliersView />
    case 'customers': return <CustomersView />
    case 'loyalty': return <LoyaltyView />
    case 'credit': return <CreditView />
    case 'expenses': return <ExpensesView />
    case 'reports': return <ReportsView />
    case 'owner': return <OwnerView />
    case 'zreport': return <ZReportView />
    case 'notifications': return <NotificationsView />
    case 'audit': return <AuditView />
    case 'backup': return <BackupView />
    case 'settings': return <SettingsView />
    case 'users': return <UsersView />
    case 'roles': return <RolesView />
    default: return <DashboardView />
  }
}

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }
  if (!user) return <Login />

  return (
    <NavProvider>
      <AppShell>
        <MainView />
      </AppShell>
    </NavProvider>
  )
}

export default function Home() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  )
}
