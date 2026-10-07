'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { PageHeader, formatPKR, cn } from '@/components/ui-helpers'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Camera, Scan, X, RefreshCw, Loader2, CheckCircle2, AlertCircle,
  Plus, Package, Zap, Image as ImageIcon, SwitchCamera, AlertTriangle,
  Edit3, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useCameraScanner } from '@/lib/use-camera-scanner'

interface RecognizedMedicine {
  medicineName: string | null
  genericName: string | null
  strength: string | null
  manufacturer: string | null
  packSize: string | null
  batchNumber: string | null
  expiryDate: string | null
  manufacturingDate: string | null
  dosageForm: string | null
  barcode: string | null
  mrp: string | null
  category: string | null
  confidence: {
    medicineName?: number
    genericName?: number
    strength?: number
    manufacturer?: number
    packSize?: number
    batchNumber?: number
    expiryDate?: number
    barcode?: number
  }
  overallConfidence: number
  notes: string | null
}

interface ScanResult {
  recognized: RecognizedMedicine
  duplicate: any | null
  scannedAt: string
  scannedBy: string
}

interface ScannedItem {
  id: string
  name: string
  generic?: string
  manufacturer?: string
  addedAt: Date
}

const LOW_CONFIDENCE_THRESHOLD = 60

export function ScanMedicineView() {
  const { hasPermission } = useAuth()
  const scanner = useCameraScanner()
  const [scanning, setScanning] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [categories, setCategories] = useState<any[]>([])
  const [continuousMode, setContinuousMode] = useState(false)
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([])
  const [autoAddHighConfidence, setAutoAddHighConfidence] = useState(false)
  const [addingMedicine, setAddingMedicine] = useState(false)
  const [galleryInputRef, setGalleryInputRef] = useState<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch categories on mount
  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(d => setCategories(d.categories || []))
  }, [])

  // Start camera when scanning starts
  const startScanning = useCallback(async () => {
    setScanning(true)
    setScanResult(null)
    setEditMode(false)
    setTimeout(async () => {
      await scanner.startCamera('environment')
    }, 100)
  }, [scanner])

  // Stop scanning
  const stopScanning = useCallback(() => {
    scanner.stopCamera()
    setScanning(false)
    setScanResult(null)
    setEditMode(false)
  }, [scanner])

  // Capture and recognize
  const handleCapture = useCallback(async () => {
    const photo = scanner.capturePhoto()
    if (!photo) {
      toast.error('Could not capture photo. Please try again.')
      return
    }
    setRecognizing(true)
    try {
      const r = await fetch('/api/scan/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photo }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Recognition failed')
      setScanResult(d)
      setEditForm(d.recognized || {})
      setEditMode(false)
      // Auto-add if high confidence and enabled
      if (autoAddHighConfidence && d.recognized?.overallConfidence >= 85 && !d.duplicate) {
        await handleAddMedicine(d.recognized, true)
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to recognize medicine')
    } finally {
      setRecognizing(false)
    }
  }, [scanner, autoAddHighConfidence])

  // Handle gallery upload (fallback)
  const handleGalleryUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large. Max 10MB.')
      return
    }
    setRecognizing(true)
    const photo = await scanner.captureFromGallery(file)
    if (!photo) {
      toast.error('Could not read image file.')
      setRecognizing(false)
      return
    }
    try {
      const r = await fetch('/api/scan/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photo }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Recognition failed')
      setScanResult(d)
      setEditForm(d.recognized || {})
      setEditMode(false)
      if (autoAddHighConfidence && d.recognized?.overallConfidence >= 85 && !d.duplicate) {
        await handleAddMedicine(d.recognized, true)
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to recognize medicine')
    } finally {
      setRecognizing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [scanner, autoAddHighConfidence])

  // Add medicine to database
  const handleAddMedicine = useCallback(async (data: any, isAuto = false) => {
    setAddingMedicine(true)
    try {
      const body = {
        name: data.medicineName || '',
        genericName: data.genericName || null,
        manufacturer: data.manufacturer || null,
        barcode: data.barcode || null,
        unitType: data.dosageForm?.toUpperCase()?.includes('SYRUP') ? 'BOTTLE'
          : data.dosageForm?.toUpperCase()?.includes('CAPSULE') ? 'CAPSULE'
          : data.dosageForm?.toUpperCase()?.includes('INJECTION') ? 'INJECTION'
          : data.dosageForm?.toUpperCase()?.includes('TUBE') ? 'TUBE'
          : data.dosageForm?.toUpperCase()?.includes('CREAM') ? 'TUBE'
          : data.dosageForm?.toUpperCase()?.includes('DROPS') ? 'BOTTLE'
          : 'TABLET',
        purchasePrice: 0,
        retailPrice: data.mrp ? parseFloat(String(data.mrp).replace(/[^0-9.]/g, '')) || 0 : 0,
        stripPrice: 0,
        boxPrice: 0,
        minStock: 10,
        maxStock: 100,
        isActive: true,
        categoryId: null,
      }
      if (!body.name) {
        toast.error('Medicine name is required')
        setAddingMedicine(false)
        return
      }
      const r = await fetch('/api/medicines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to add medicine')

      if (continuousMode) {
        setScannedItems(prev => [...prev, {
          id: d.medicine.id,
          name: d.medicine.name,
          generic: d.medicine.genericName || undefined,
          manufacturer: d.medicine.manufacturer || undefined,
          addedAt: new Date(),
        }])
        toast.success(`Added: ${d.medicine.name}`, { duration: 2000 })
        // Continue scanning
        setScanResult(null)
        setEditMode(false)
        setAddingMedicine(false)
        // Auto-capture next if in continuous mode
        return
      }

      toast.success(`Medicine "${d.medicine.name}" added to inventory`, {
        description: 'Add a batch via Inventory to set stock for sale.',
      })
      stopScanning()
    } catch (e: any) {
      toast.error(e.message || 'Failed to add medicine')
    } finally {
      setAddingMedicine(false)
    }
  }, [continuousMode, stopScanning])

  // Add new batch to existing medicine
  const handleAddBatch = useCallback(async () => {
    if (!scanResult?.duplicate) return
    setAddingMedicine(true)
    try {
      const dup = scanResult.duplicate
      const rec = scanResult.recognized
      const expiry = rec.expiryDate || ''
      const batch = rec.batchNumber || `BATCH-${Date.now().toString(36).toUpperCase()}`
      const r = await fetch(`/api/medicines/${dup.id}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchNumber: batch,
          expiryDate: expiry ? new Date(expiry) : new Date(Date.now() + 365 * 86400000),
          packSizeBox: 1,
          packSizeStrip: 1,
          quantity: 0,
          purchasePrice: 0,
          salePrice: dup.retailPrice || 0,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to add batch')
      toast.success(`Batch "${batch}" added to ${dup.name}`, {
        description: 'Add quantity via Inventory to set stock.',
      })
      stopScanning()
    } catch (e: any) {
      toast.error(e.message || 'Failed to add batch')
    } finally {
      setAddingMedicine(false)
    }
  }, [scanResult, stopScanning])

  // Finish continuous scanning
  const finishContinuous = useCallback(() => {
    setContinuousMode(false)
    setScannedItems([])
    stopScanning()
    toast.success(`Added ${scannedItems.length} medicines via scanner`)
  }, [scannedItems, stopScanning])

  if (!hasPermission('inventory.edit')) {
    return <PageHeader title="Scan Medicine" subtitle="Access denied — requires inventory.edit permission" />
  }

  const conf = scanResult?.recognized?.confidence || {}
  const overall = scanResult?.recognized?.overallConfidence || 0
  const isHighConfidence = overall >= 85
  const hasLowFields = Object.values(conf).some(c => c != null && c < LOW_CONFIDENCE_THRESHOLD)

  return (
    <div>
      <PageHeader
        title="Scan & Add Medicine"
        subtitle="Use your camera to scan medicine packaging and auto-fill details"
        actions={
          !scanning ? (
            <>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAddHighConfidence}
                  onChange={e => setAutoAddHighConfidence(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span className="text-muted-foreground">Auto-add high-confidence scans</span>
              </label>
              <Button onClick={startScanning} className="bg-primary">
                <Camera className="h-4 w-4 mr-2" /> Scan Medicine
              </Button>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={continuousMode}
                  onChange={e => {
                    setContinuousMode(e.target.checked)
                    if (!e.target.checked && scannedItems.length > 0) finishContinuous()
                  }}
                  className="h-4 w-4 rounded"
                />
                <span className="text-muted-foreground">Continuous scan</span>
              </label>
              <Button variant="outline" onClick={stopScanning}>
                <X className="h-4 w-4 mr-2" /> Close
              </Button>
            </>
          )
        }
      />

      {/* Not scanning - show intro */}
      {!scanning && (
        <Card className="shadow-sm">
          <CardContent className="py-12">
            <div className="text-center max-w-md mx-auto space-y-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto">
                <Scan className="h-10 w-10" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Scan Medicine Packaging</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Point your camera at a medicine box to automatically read and fill medicine details.
                  Uses AI vision to recognize brand name, generic, strength, manufacturer, batch, and expiry.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-3 rounded-lg border bg-card">
                  <Camera className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <div className="font-semibold">Camera Scan</div>
                  <div className="text-muted-foreground">Rear camera auto-detects</div>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                  <Sparkles className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <div className="font-semibold">AI Recognition</div>
                  <div className="text-muted-foreground">VLM extracts fields</div>
                </div>
                <div className="p-3 rounded-lg border bg-card">
                  <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
                  <div className="font-semibold">Fast Add</div>
                  <div className="text-muted-foreground">One-tap confirm</div>
                </div>
              </div>
              <Button onClick={startScanning} size="lg" className="bg-primary">
                <Camera className="h-5 w-5 mr-2" /> Open Camera Scanner
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Requires camera permission. Works on Android Chrome, iPhone Safari, and desktop browsers with webcam.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scanning - camera view */}
      {scanning && (
        <div className="space-y-4">
          {/* Camera view */}
          <Card className="shadow-sm overflow-hidden">
            <div className="relative bg-black aspect-video sm:aspect-[4/3] max-h-[60vh] mx-auto">
              <video
                ref={scanner.videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
              {/* Scanning frame overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-[70%] max-w-md aspect-[3/4] border-2 border-primary/60 rounded-xl">
                  {/* Corner markers */}
                  <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                  <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                  <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
                </div>
              </div>

              {/* Top bar */}
              <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-3 flex items-center justify-between">
                <Button size="sm" variant="ghost" onClick={stopScanning} className="text-white hover:bg-white/20">
                  <X className="h-4 w-4 mr-1" /> Back
                </Button>
                <div className="text-white text-sm font-semibold flex items-center gap-2">
                  <Scan className="h-4 w-4" /> SCAN MEDICINE
                </div>
                <Button size="sm" variant="ghost" onClick={scanner.switchCamera} className="text-white hover:bg-white/20">
                  <SwitchCamera className="h-4 w-4" />
                </Button>
              </div>

              {/* Bottom bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <div className="text-center text-white text-xs mb-3">
                  {recognizing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Reading medicine details...
                    </span>
                  ) : scanner.state.error ? (
                    <span className="text-amber-300">{scanner.state.error}</span>
                  ) : !scanner.state.isReady ? (
                    <span>Opening camera...</span>
                  ) : (
                    <span>Place medicine inside the frame</span>
                  )}
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-white hover:bg-white/20"
                    title="Upload from gallery"
                  >
                    <ImageIcon className="h-5 w-5" />
                  </Button>
                  <Button
                    size="lg"
                    onClick={handleCapture}
                    disabled={!scanner.state.isReady || recognizing}
                    className="bg-primary hover:bg-primary/90 rounded-full h-16 w-16 p-0"
                  >
                    {recognizing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={scanner.switchCamera}
                    className="text-white hover:bg-white/20"
                    title="Switch camera"
                  >
                    <SwitchCamera className="h-5 w-5" />
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleGalleryUpload}
                  className="hidden"
                />
              </div>
            </div>
          </Card>

          {/* Continuous scan list */}
          {continuousMode && scannedItems.length > 0 && (
            <Card className="shadow-sm">
              <CardContent className="py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Scanned Items ({scannedItems.length})
                  </div>
                  <Button size="sm" onClick={finishContinuous}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Done
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {scannedItems.map((item, i) => (
                    <Badge key={i} variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> {item.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Scan result modal */}
          {scanResult && (
            <Dialog open={!!scanResult} onOpenChange={(o) => { if (!o) setScanResult(null) }}>
              <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', isHighConfidence ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400')}>
                      {isHighConfidence ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    </div>
                    Scanned Medicine
                    {isHighConfidence && !scanResult.duplicate && (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 ml-2">
                        ✓ Ready to Add
                      </Badge>
                    )}
                  </DialogTitle>
                </DialogHeader>

                {/* Duplicate warning */}
                {scanResult.duplicate && (
                  <div className="rounded-lg border-2 border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sky-800 dark:text-sky-300 font-semibold text-sm">
                      <AlertTriangle className="h-4 w-4" /> Medicine already exists
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <strong>{scanResult.duplicate.name}</strong>
                      {scanResult.duplicate.genericName && ` (${scanResult.duplicate.genericName})`}
                      {scanResult.duplicate.manufacturer && ` • ${scanResult.duplicate.manufacturer}`}
                      {scanResult.duplicate.categoryName && ` • ${scanResult.duplicate.categoryName}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Current stock: <strong>{scanResult.duplicate.stock}</strong> units
                      {scanResult.duplicate.barcode && ` • Barcode: ${scanResult.duplicate.barcode}`}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => { setScanResult(null); setEditMode(false) }}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleAddBatch} disabled={addingMedicine} className="bg-sky-600 hover:bg-sky-700">
                        {addingMedicine ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                        Add New Batch
                      </Button>
                    </div>
                  </div>
                )}

                {/* Confidence summary */}
                <div className={cn('rounded-lg p-2.5 text-xs flex items-center justify-between', overall >= 85 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : overall >= 60 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400')}>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span className="font-semibold">Overall Confidence: {overall}%</span>
                  </div>
                  {hasLowFields && (
                    <span className="text-[10px]">Some fields need verification</span>
                  )}
                </div>

                {/* Recognized fields */}
                {!scanResult.duplicate && (
                  <div className="space-y-2.5">
                    <ScanField label="Medicine Name" value={scanResult.recognized.medicineName} confidence={conf.medicineName} editable={editMode} onChange={(v) => setEditForm({ ...editForm, medicineName: v })} />
                    <ScanField label="Generic/Salt" value={scanResult.recognized.genericName} confidence={conf.genericName} editable={editMode} onChange={(v) => setEditForm({ ...editForm, genericName: v })} />
                    <ScanField label="Strength" value={scanResult.recognized.strength} confidence={conf.strength} editable={editMode} onChange={(v) => setEditForm({ ...editForm, strength: v })} />
                    <ScanField label="Manufacturer" value={scanResult.recognized.manufacturer} confidence={conf.manufacturer} editable={editMode} onChange={(v) => setEditForm({ ...editForm, manufacturer: v })} />
                    <ScanField label="Pack Size" value={scanResult.recognized.packSize} confidence={conf.packSize} editable={editMode} onChange={(v) => setEditForm({ ...editForm, packSize: v })} />
                    <ScanField label="Batch Number" value={scanResult.recognized.batchNumber} confidence={conf.batchNumber} editable={editMode} onChange={(v) => setEditForm({ ...editForm, batchNumber: v })} />
                    <ScanField label="Expiry Date" value={scanResult.recognized.expiryDate} confidence={conf.expiryDate} editable={editMode} onChange={(v) => setEditForm({ ...editForm, expiryDate: v })} />
                    <ScanField label="Barcode" value={scanResult.recognized.barcode} confidence={conf.barcode} editable={editMode} onChange={(v) => setEditForm({ ...editForm, barcode: v })} />
                    {scanResult.recognized.dosageForm && (
                      <ScanField label="Dosage Form" value={scanResult.recognized.dosageForm} confidence={undefined} editable={editMode} onChange={(v) => setEditForm({ ...editForm, dosageForm: v })} />
                    )}
                    {scanResult.recognized.mrp && (
                      <ScanField label="MRP" value={scanResult.recognized.mrp} confidence={undefined} editable={editMode} onChange={(v) => setEditForm({ ...editForm, mrp: v })} />
                    )}
                    {scanResult.recognized.category && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Category (detected)</Label>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{scanResult.recognized.category}</Badge>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes from VLM */}
                {scanResult.recognized.notes && (
                  <div className="text-xs text-muted-foreground italic p-2 rounded-md bg-muted">
                    Note: {scanResult.recognized.notes}
                  </div>
                )}

                {/* Action buttons */}
                {!scanResult.duplicate && (
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => { setScanResult(null); setEditMode(false) }}>
                      Cancel
                    </Button>
                    {!editMode ? (
                      <Button variant="outline" onClick={() => setEditMode(true)}>
                        <Edit3 className="h-4 w-4 mr-2" /> Edit Details
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => setEditMode(false)}>
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Done Editing
                      </Button>
                    )}
                    <Button
                      onClick={() => handleAddMedicine(editMode ? editForm : scanResult.recognized)}
                      disabled={addingMedicine}
                      className="bg-primary"
                    >
                      {addingMedicine ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                      Add Medicine
                    </Button>
                  </DialogFooter>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
    </div>
  )
}

// Helper component for displaying recognized fields with confidence
function ScanField({ label, value, confidence, editable, onChange }: {
  label: string
  value: string | null
  confidence?: number
  editable: boolean
  onChange: (v: string) => void
}) {
  const isLow = confidence != null && confidence < LOW_CONFIDENCE_THRESHOLD
  const isHigh = confidence != null && confidence >= 85

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {confidence != null && (
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] font-mono',
              isHigh ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200'
              : isLow ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200'
            )}
          >
            {confidence}%
          </Badge>
        )}
      </div>
      {editable ? (
        <Input
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder="Not detected"
          className={cn('h-8 text-sm', isLow && 'border-red-300 dark:border-red-700')}
        />
      ) : (
        <div className={cn(
          'px-2.5 py-1.5 rounded-md text-sm border',
          value ? 'bg-card' : 'bg-muted/30 text-muted-foreground italic',
          isLow && 'border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-900/10'
        )}>
          {value || 'Not detected'}
        </div>
      )}
    </div>
  )
}
