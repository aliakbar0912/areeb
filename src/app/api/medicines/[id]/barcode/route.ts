import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'

// GET /api/medicines/[id]/barcode — returns printable HTML with barcode label
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const medicine = await db.medicine.findUnique({
    where: { id },
    include: { category: true },
  })
  if (!medicine) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const settings = await getSettings()
  const pharmacyName = settings['pharmacy.name'] || 'Pharmacy'
  const pharmacyPhone = settings['pharmacy.phone'] || ''
  const currency = settings['pharmacy.currency'] || 'PKR'

  // Use barcode from DB or generate from medicine ID
  const barcodeValue = medicine.barcode || medicine.id.slice(-12).padStart(12, '0')
  const retailPrice = medicine.retailPrice.toFixed(2)
  const stripPrice = medicine.stripPrice.toFixed(2)
  const boxPrice = medicine.boxPrice.toFixed(2)

  // Generate barcode bars as CSS (simple Code-128-like visual using the digits)
  // For a real barcode, we'd use a library like jsbarcode, but for printable HTML
  // we'll create a visual representation using the digits as a fallback
  const barcodeBars = generateBarcodeBars(barcodeValue)

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Barcode - ${medicine.name}</title>
  <style>
    @page { size: 50mm 25mm; margin: 0; }
    body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; }
    .label {
      width: 50mm; height: 25mm;
      box-sizing: border-box;
      padding: 1.5mm 2mm;
      display: flex; flex-direction: column;
      border: 1px dashed #ccc;
      page-break-after: always;
    }
    .header {
      font-size: 7px; font-weight: bold;
      text-align: center;
      border-bottom: 0.5px solid #000;
      padding-bottom: 0.5mm;
      margin-bottom: 0.5mm;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .name {
      font-size: 8px; font-weight: bold;
      text-align: center;
      margin-bottom: 0.5mm;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .generic {
      font-size: 6px; color: #555;
      text-align: center;
      margin-bottom: 0.5mm;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .barcode {
      display: flex; align-items: flex-end; justify-content: center;
      height: 8mm; margin: 0.5mm 0;
    }
    .barcode-bars {
      display: flex; align-items: stretch; height: 8mm;
    }
    .bar { background: #000; }
    .space { background: transparent; }
    .barcode-text {
      font-family: 'Courier New', monospace;
      font-size: 7px; font-weight: bold;
      text-align: center;
      letter-spacing: 1px;
      margin-top: 0.5mm;
    }
    .prices {
      display: flex; justify-content: space-between;
      font-size: 7px; font-weight: bold;
      margin-top: auto;
      padding-top: 0.5mm;
      border-top: 0.5px solid #000;
    }
    .price-item { text-align: center; }
    .price-label { font-size: 5px; color: #666; font-weight: normal; }
    .price-value { font-size: 8px; }
    @media print {
      .label { border: none; }
      .no-print { display: none; }
    }
    .print-btn {
      position: fixed; top: 10px; right: 10px;
      padding: 8px 16px; background: #0d9488; color: white;
      border: none; border-radius: 6px; cursor: pointer;
      font-size: 14px; font-weight: 600;
    }
    .print-btn:hover { background: #0f766e; }
  </style></head><body>
    <button class="print-btn no-print" onclick="window.print()">Print Labels</button>
    <div class="label">
      <div class="header">${pharmacyName.toUpperCase()}</div>
      <div class="name">${escapeHtml(medicine.name)}</div>
      ${medicine.genericName ? `<div class="generic">${escapeHtml(medicine.genericName)}</div>` : ''}
      <div class="barcode">
        <div class="barcode-bars">${barcodeBars}</div>
      </div>
      <div class="barcode-text">${barcodeValue}</div>
      <div class="prices">
        <div class="price-item">
          <div class="price-label">RETAIL</div>
          <div class="price-value">${currency} ${retailPrice}</div>
        </div>
        ${medicine.stripPrice > 0 ? `
        <div class="price-item">
          <div class="price-label">STRIP</div>
          <div class="price-value">${currency} ${stripPrice}</div>
        </div>` : ''}
        ${medicine.boxPrice > 0 ? `
        <div class="price-item">
          <div class="price-label">BOX</div>
          <div class="price-value">${currency} ${boxPrice}</div>
        </div>` : ''}
      </div>
    </div>
    <script>
      window.onload = () => { setTimeout(() => window.print(), 300); }
    </script>
  </body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Generate barcode bars as HTML divs (visual representation of Code-128)
// Each digit becomes a pattern of bars and spaces
function generateBarcodeBars(value: string): string {
  if (!value) return ''
  let bars = ''
  // Start code
  bars += bar(2) + space(1) + bar(1) + space(2) + bar(2)
  // Encode each character
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    // Simple encoding: alternate bar widths based on char code
    const w1 = (c % 3) + 1
    const w2 = ((c >> 2) % 3) + 1
    const w3 = ((c >> 4) % 3) + 1
    bars += space(1) + bar(w1) + space(w2) + bar(w3)
  }
  // End code
  bars += space(1) + bar(2) + space(1) + bar(3) + space(1) + bar(1)
  return bars
}

function bar(width: number): string {
  return `<div class="bar" style="width:${width * 0.3}mm"></div>`
}
function space(width: number): string {
  return `<div class="space" style="width:${width * 0.3}mm"></div>`
}
