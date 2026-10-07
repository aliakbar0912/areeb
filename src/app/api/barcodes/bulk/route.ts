import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'

// POST /api/barcodes/bulk
// Body: { ids: string[] } — array of medicine IDs
// Returns printable HTML with all barcode labels
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { ids } = body || {}
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 })
  }
  if (ids.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 barcodes per print' }, { status: 400 })
  }

  const medicines = await db.medicine.findMany({
    where: { id: { in: ids } },
    include: { category: true },
  })
  if (medicines.length === 0) {
    return NextResponse.json({ error: 'No medicines found' }, { status: 404 })
  }

  const settings = await getSettings()
  const pharmacyName = settings['pharmacy.name'] || 'Pharmacy'
  const currency = settings['pharmacy.currency'] || 'PKR'

  const labels = medicines.map(m => {
    const barcodeValue = m.barcode || m.id.slice(-12).padStart(12, '0')
    const retailPrice = m.retailPrice.toFixed(2)
    const stripPrice = m.stripPrice.toFixed(2)
    const boxPrice = m.boxPrice.toFixed(2)
    const barcodeBars = generateBarcodeBars(barcodeValue)
    const genericLine = m.genericName ? `<div class="generic">${escapeHtml(m.genericName)}</div>` : ''
    const stripLine = m.stripPrice > 0 ? `
        <div class="price-item">
          <div class="price-label">STRIP</div>
          <div class="price-value">${currency} ${stripPrice}</div>
        </div>` : ''
    const boxLine = m.boxPrice > 0 ? `
        <div class="price-item">
          <div class="price-label">BOX</div>
          <div class="price-value">${currency} ${boxPrice}</div>
        </div>` : ''

    return `<div class="label">
      <div class="header">${escapeHtml(pharmacyName.toUpperCase())}</div>
      <div class="name">${escapeHtml(m.name)}</div>
      ${genericLine}
      <div class="barcode">
        <div class="barcode-bars">${barcodeBars}</div>
      </div>
      <div class="barcode-text">${barcodeValue}</div>
      <div class="prices">
        <div class="price-item">
          <div class="price-label">RETAIL</div>
          <div class="price-value">${currency} ${retailPrice}</div>
        </div>
        ${stripLine}
        ${boxLine}
      </div>
    </div>`
  }).join('\n')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bulk Barcodes - ${medicines.length} medicines</title>
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
    .toolbar {
      position: sticky; top: 0; z-index: 100;
      background: #0d9488; color: white;
      padding: 10px 20px;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 14px;
    }
    .toolbar button {
      padding: 6px 16px; background: white; color: #0d9488;
      border: none; border-radius: 6px; cursor: pointer;
      font-size: 13px; font-weight: 600;
    }
    .toolbar button:hover { background: #f0fdfa; }
    .labels-grid {
      display: grid; grid-template-columns: repeat(4, 50mm); gap: 2mm;
      padding: 20px; justify-content: center;
    }
    @media print {
      .labels-grid { display: block; padding: 0; }
    }
  </style></head><body>
    <div class="toolbar no-print">
      <span>${medicines.length} barcode labels ready to print</span>
      <button onclick="window.print()">Print All</button>
    </div>
    <div class="labels-grid">
      ${labels}
    </div>
    <script>
      window.onload = () => { /* user clicks Print All button */ }
    </script>
  </body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function generateBarcodeBars(value: string): string {
  if (!value) return ''
  let bars = ''
  bars += bar(2) + space(1) + bar(1) + space(2) + bar(2)
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    const w1 = (c % 3) + 1
    const w2 = ((c >> 2) % 3) + 1
    const w3 = ((c >> 4) % 3) + 1
    bars += space(1) + bar(w1) + space(w2) + bar(w3)
  }
  bars += space(1) + bar(2) + space(1) + bar(3) + space(1) + bar(1)
  return bars
}

function bar(width: number): string {
  return `<div class="bar" style="width:${width * 0.3}mm"></div>`
}
function space(width: number): string {
  return `<div class="space" style="width:${width * 0.3}mm"></div>`
}
