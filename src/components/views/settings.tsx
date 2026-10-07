'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader, cn, formatDateTime } from '@/components/ui-helpers'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Save, Loader2, Building2, Receipt, Boxes, Percent, DatabaseBackup,
  Settings as SettingsIcon, Check, Clock, Award,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

const RECEIPT_SIZES = ['80mm', '58mm', 'A4']

const PHARMACY_KEYS = ['pharmacy.name', 'pharmacy.address', 'pharmacy.phone', 'pharmacy.email', 'pharmacy.currency'] as const
const INVOICE_KEYS = ['invoice.prefix', 'invoice.receiptSize', 'invoice.showBarcode', 'invoice.footerNote', 'salesReturn.prefix', 'purchase.prefix', 'salesReturn.prefix', 'purchaseReturn.prefix'] as const
const STOCK_KEYS = ['stock.lowStockThreshold', 'stock.expiryAlertDays', 'stock.expiryShortDays', 'stock.allowNegative', 'stock.fifoEnabled'] as const
const TAX_KEYS = ['invoice.taxEnabled', 'invoice.taxRate'] as const
const BACKUP_KEYS = ['backup.autoEnabled', 'backup.lastRun'] as const

const ALL_KEYS = Array.from(new Set<string>([
  ...PHARMACY_KEYS, ...INVOICE_KEYS, ...STOCK_KEYS, ...TAX_KEYS, ...BACKUP_KEYS,
]))

export function SettingsView() {
  const { hasPermission } = useAuth()
  const canView = hasPermission('settings.view')
  const canEdit = hasPermission('settings.edit')

  const [values, setValues] = useState<Record<string, string>>({})
  const [original, setOriginal] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/settings')
      if (!r.ok) throw new Error('Failed to load settings')
      const d = await r.json()
      const s: Record<string, string> = {}
      for (const k of ALL_KEYS) s[k] = String(d.settings?.[k] ?? '')
      setValues(s)
      setOriginal(s)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canView) load()
    else setLoading(false)
  }, [canView, load])

  const setVal = (k: string, v: string) => setValues(prev => ({ ...prev, [k]: v }))
  const getBool = (k: string) => values[k] === 'true' || values[k] === '1'

  const saveAll = async () => {
    setSaving(true)
    try {
      const diff: Record<string, string> = {}
      for (const k of ALL_KEYS) {
        if (values[k] !== original[k]) diff[k] = values[k]
      }
      if (Object.keys(diff).length === 0) {
        toast.info('No changes to save')
        return
      }
      const r = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diff),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Save failed')
      toast.success('Settings saved')
      setOriginal({ ...values })
    } catch (e: any) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const saveOne = async (keys: readonly string[]) => {
    setSaving(true)
    try {
      const diff: Record<string, string> = {}
      for (const k of keys) {
        if (values[k] !== original[k]) diff[k] = values[k]
      }
      if (Object.keys(diff).length === 0) {
        toast.info('No changes in this section')
        return
      }
      const r = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diff),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Save failed')
      toast.success('Section saved')
      setOriginal({ ...original, ...diff })
    } catch (e: any) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!canView) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Pharmacy configuration" />
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <SettingsIcon className="h-8 w-8 text-muted-foreground mb-2" />
          <div className="font-semibold">Access denied</div>
          <div className="text-sm text-muted-foreground">You do not have permission to view settings.</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Pharmacy configuration"
        actions={
          canEdit ? (
            <Button onClick={saveAll} disabled={saving || loading}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save All Settings
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full max-w-2xl" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="pharmacy" className="space-y-4">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="pharmacy"><Building2 className="h-3.5 w-3.5" /> Pharmacy Info</TabsTrigger>
            <TabsTrigger value="invoice"><Receipt className="h-3.5 w-3.5" /> Invoice</TabsTrigger>
            <TabsTrigger value="stock"><Boxes className="h-3.5 w-3.5" /> Stock</TabsTrigger>
            <TabsTrigger value="tax"><Percent className="h-3.5 w-3.5" /> Tax</TabsTrigger>
            <TabsTrigger value="loyalty"><Award className="h-3.5 w-3.5" /> Loyalty</TabsTrigger>
            <TabsTrigger value="backup"><DatabaseBackup className="h-3.5 w-3.5" /> Backup</TabsTrigger>
          </TabsList>

          {/* Pharmacy Info */}
          <TabsContent value="pharmacy">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Pharmacy Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Pharmacy Name">
                    <Input value={values['pharmacy.name'] || ''} onChange={e => setVal('pharmacy.name', e.target.value)} disabled={!canEdit} />
                  </Field>
                  <Field label="Currency">
                    <Input value={values['pharmacy.currency'] || ''} onChange={e => setVal('pharmacy.currency', e.target.value)} disabled={!canEdit} placeholder="PKR" />
                  </Field>
                  <Field label="Phone">
                    <Input value={values['pharmacy.phone'] || ''} onChange={e => setVal('pharmacy.phone', e.target.value)} disabled={!canEdit} placeholder="+92 300 1234567" />
                  </Field>
                  <Field label="Email">
                    <Input type="email" value={values['pharmacy.email'] || ''} onChange={e => setVal('pharmacy.email', e.target.value)} disabled={!canEdit} placeholder="info@pharmacy.pk" />
                  </Field>
                  <div className="md:col-span-2 space-y-1.5">
                    <Label>Address</Label>
                    <Textarea
                      rows={2}
                      value={values['pharmacy.address'] || ''}
                      onChange={e => setVal('pharmacy.address', e.target.value)}
                      disabled={!canEdit}
                      placeholder="Full pharmacy address"
                    />
                  </div>
                </div>
                {canEdit && <SectionFooter onSave={() => saveOne(PHARMACY_KEYS)} saving={saving} />}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoice */}
          <TabsContent value="invoice">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-primary" />
                  Invoice & Receipt
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Invoice Prefix" hint="Used for sales invoice numbers">
                    <Input value={values['invoice.prefix'] || ''} onChange={e => setVal('invoice.prefix', e.target.value)} disabled={!canEdit} placeholder="INV" />
                  </Field>
                  <Field label="Receipt Size">
                    <Select
                      value={values['invoice.receiptSize'] || '80mm'}
                      onValueChange={v => setVal('invoice.receiptSize', v)}
                      disabled={!canEdit}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RECEIPT_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Purchase Prefix">
                    <Input value={values['purchase.prefix'] || ''} onChange={e => setVal('purchase.prefix', e.target.value)} disabled={!canEdit} placeholder="PUR" />
                  </Field>
                  <Field label="Sales Return Prefix">
                    <Input value={values['salesReturn.prefix'] || ''} onChange={e => setVal('salesReturn.prefix', e.target.value)} disabled={!canEdit} placeholder="SR" />
                  </Field>
                  <Field label="Purchase Return Prefix">
                    <Input value={values['purchaseReturn.prefix'] || ''} onChange={e => setVal('purchaseReturn.prefix', e.target.value)} disabled={!canEdit} placeholder="PR" />
                  </Field>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm font-medium">Show barcode on invoice</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Display the invoice number as a barcode on printed receipts.</p>
                  </div>
                  <Switch
                    checked={getBool('invoice.showBarcode')}
                    onCheckedChange={v => setVal('invoice.showBarcode', v ? 'true' : 'false')}
                    disabled={!canEdit}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Footer Note</Label>
                  <Textarea
                    rows={3}
                    value={values['invoice.footerNote'] || ''}
                    onChange={e => setVal('invoice.footerNote', e.target.value)}
                    disabled={!canEdit}
                    placeholder="Thank you message or return policy"
                  />
                </div>

                {canEdit && <SectionFooter onSave={() => saveOne(INVOICE_KEYS)} saving={saving} />}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stock */}
          <TabsContent value="stock">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Boxes className="h-5 w-5 text-primary" />
                  Stock Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Low Stock Threshold" hint="Default min stock value">
                    <Input
                      type="number"
                      value={values['stock.lowStockThreshold'] || '0'}
                      onChange={e => setVal('stock.lowStockThreshold', e.target.value)}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="Expiry Alert Days" hint="Warn this many days before expiry">
                    <Input
                      type="number"
                      value={values['stock.expiryAlertDays'] || '0'}
                      onChange={e => setVal('stock.expiryAlertDays', e.target.value)}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="Expiry Short Days" hint="Critical expiry window">
                    <Input
                      type="number"
                      value={values['stock.expiryShortDays'] || '0'}
                      onChange={e => setVal('stock.expiryShortDays', e.target.value)}
                      disabled={!canEdit}
                    />
                  </Field>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm font-medium">Allow negative stock</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Permit selling even when stock is zero (not recommended).</p>
                  </div>
                  <Switch
                    checked={getBool('stock.allowNegative')}
                    onCheckedChange={v => setVal('stock.allowNegative', v ? 'true' : 'false')}
                    disabled={!canEdit}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm font-medium">FIFO enabled</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Sell oldest batches first (FEFO used for expiry — this is the secondary FIFO rule).</p>
                  </div>
                  <Switch
                    checked={getBool('stock.fifoEnabled')}
                    onCheckedChange={v => setVal('stock.fifoEnabled', v ? 'true' : 'false')}
                    disabled={!canEdit}
                  />
                </div>

                {canEdit && <SectionFooter onSave={() => saveOne(STOCK_KEYS)} saving={saving} />}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tax */}
          <TabsContent value="tax">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Percent className="h-5 w-5 text-primary" />
                  Tax Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm font-medium">Enable tax on invoices</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Apply tax at the configured rate on every sale.</p>
                  </div>
                  <Switch
                    checked={getBool('invoice.taxEnabled')}
                    onCheckedChange={v => setVal('invoice.taxEnabled', v ? 'true' : 'false')}
                    disabled={!canEdit}
                  />
                </div>

                <Separator />

                <Field label="Tax Rate (%)" hint="Percentage applied to invoice subtotal">
                  <Input
                    type="number"
                    step="0.01"
                    value={values['invoice.taxRate'] || '0'}
                    onChange={e => setVal('invoice.taxRate', e.target.value)}
                    disabled={!canEdit}
                  />
                </Field>

                {canEdit && <SectionFooter onSave={() => saveOne(TAX_KEYS)} saving={saving} />}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Loyalty Program */}
          <TabsContent value="loyalty">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  Loyalty Program
                </CardTitle>
                <CardDescription>
                  Configure customer loyalty points — earned automatically on purchases, redeemable as discounts in POS.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Enable/Disable */}
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <div className="font-medium text-sm">Enable Loyalty Program</div>
                    <div className="text-xs text-muted-foreground">When enabled, customers earn points automatically on every purchase.</div>
                  </div>
                  <Switch
                    checked={values['loyalty.enabled'] === 'true'}
                    onCheckedChange={(v) => setVal('loyalty.enabled', String(v))}
                  />
                </div>

                {/* Earning Rules */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Earning Rules</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="loyalty-rupees" className="text-xs">Rupees per Point</Label>
                      <Input
                        id="loyalty-rupees"
                        type="number" min="1"
                        value={values['loyalty.rupeesPerPoint']}
                        onChange={(e) => setVal('loyalty.rupeesPerPoint', e.target.value)}
                      />
                      <p className="text-[10px] text-muted-foreground">Customer earns 1 point per this many Rs spent (default: 100).</p>
                    </div>
                  </div>
                </div>

                {/* Redemption Rules */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Redemption Rules</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="loyalty-redeemRate" className="text-xs">Redeem Rate (Rs per point)</Label>
                      <Input
                        id="loyalty-redeemRate"
                        type="number" min="0" step="any"
                        value={values['loyalty.redeemRate']}
                        onChange={(e) => setVal('loyalty.redeemRate', e.target.value)}
                      />
                      <p className="text-[10px] text-muted-foreground">1 point = this many Rs discount (default: 1).</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="loyalty-minRedeem" className="text-xs">Minimum Points to Redeem</Label>
                      <Input
                        id="loyalty-minRedeem"
                        type="number" min="1"
                        value={values['loyalty.minRedeemPoints']}
                        onChange={(e) => setVal('loyalty.minRedeemPoints', e.target.value)}
                      />
                      <p className="text-[10px] text-muted-foreground">Minimum points required before redemption allowed (default: 50).</p>
                    </div>
                  </div>
                </div>

                {/* Tier Info */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loyalty Tiers (fixed)</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-orange-400" />
                      <span><strong>Bronze</strong>: 1-499 pts</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      <span><strong>Silver</strong>: 500-1,999 pts</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      <span><strong>Gold</strong>: 2,000-4,999 pts</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-purple-400" />
                      <span><strong>Platinum</strong>: 5,000+ pts</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Tiers are automatically calculated from total points and cannot be customized.</p>
                </div>

                {/* Example */}
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                  <div className="font-semibold text-primary mb-1">Example</div>
                  <div className="text-muted-foreground">
                    With defaults (Rs 100/point, 1 Rs/point, min 50 pts):
                    <br />• Sale of Rs 1,500 → customer earns <strong>15 points</strong>
                    <br />• 50 points redeemed → <strong>Rs 50 discount</strong> on next sale
                    <br />• After 100 sales of Rs 1,500 → <strong>1,500 points</strong> (Silver tier)
                  </div>
                </div>

                {/* Save button */}
                {canEdit && <SectionFooter onSave={() => saveOne(['loyalty.enabled', 'loyalty.rupeesPerPoint', 'loyalty.redeemRate', 'loyalty.minRedeemPoints'] as any)} saving={saving} />}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Backup */}
          <TabsContent value="backup">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <DatabaseBackup className="h-5 w-5 text-primary" />
                  Backup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm font-medium">Auto-backup</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Enable automatic scheduled backups. Configure the full workflow in the Backup view.</p>
                  </div>
                  <Switch
                    checked={getBool('backup.autoEnabled')}
                    onCheckedChange={v => setVal('backup.autoEnabled', v ? 'true' : 'false')}
                    disabled={!canEdit}
                  />
                </div>

                <Separator />

                <div className="rounded-lg border p-3 bg-muted/30 flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Last backup:</span>
                  <span className="font-medium">
                    {values['backup.lastRun'] ? formatDateTime(values['backup.lastRun']) : 'Never'}
                  </span>
                </div>

                {canEdit && <SectionFooter onSave={() => saveOne(BACKUP_KEYS)} saving={saving} />}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {canEdit && !loading && (
        <div className="mt-5 flex justify-end">
          <Button onClick={saveAll} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save All Settings
          </Button>
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SectionFooter({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  return (
    <div className="pt-2 flex justify-end border-t">
      <Button variant="secondary" size="sm" onClick={onSave} disabled={saving}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Save this section
      </Button>
    </div>
  )
}
