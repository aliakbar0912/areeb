import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sale = await db.sale.findUnique({
    where: { id },
    include: {
      customer: true, items: { include: { medicine: true } }, payments: true, user: true,
    },
  })
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const settings = await getSettings()
  // generate a simple printable HTML receipt
  const currency = settings['pharmacy.currency'] || 'PKR'
  const rows = sale.items.map(it => `
    <tr>
      <td>${it.medicine?.name ?? ''}</td>
      <td style="text-align:right">${it.quantity}</td>
      <td style="text-align:right">${it.unitPrice.toFixed(2)}</td>
      <td style="text-align:right">${it.total.toFixed(2)}</td>
    </tr>
  `).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${sale.invoiceNumber}</title>
  <style>
    body { font-family: 'Courier New', monospace; padding: 12px; max-width: 320px; margin: 0 auto; font-size: 12px; }
    .center { text-align: center; }
    .right { text-align: right; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th { border-bottom: 1px solid #000; padding: 4px 2px; font-size: 11px; }
    td { padding: 2px; }
    .total-row td { border-top: 1px solid #000; font-weight: bold; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    @media print { body { padding: 0; } }
  </style></head>
  <body>
    <div class="center"><strong>${settings['pharmacy.name'] || 'Pharmacy'}</strong></div>
    <div class="center">${settings['pharmacy.address'] || ''}</div>
    <div class="center">${settings['pharmacy.phone'] || ''}</div>
    <hr>
    <div>Invoice: <strong>${sale.invoiceNumber}</strong></div>
    <div>Date: ${new Date(sale.createdAt).toLocaleString()}</div>
    <div>Customer: ${sale.customer?.name ?? 'Walk-in Customer'}</div>
    <div>Cashier: ${sale.user?.name ?? ''}</div>
    <hr>
    <table>
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <hr>
    <table>
      <tr><td>Subtotal:</td><td class="right">${currency} ${sale.subtotal.toFixed(2)}</td></tr>
      ${sale.discount > 0 ? `<tr><td>Discount:</td><td class="right">- ${currency} ${sale.discount.toFixed(2)}</td></tr>` : ''}
      ${sale.tax > 0 ? `<tr><td>Tax:</td><td class="right">+ ${currency} ${sale.tax.toFixed(2)}</td></tr>` : ''}
      <tr class="total-row"><td>TOTAL:</td><td class="right">${currency} ${sale.total.toFixed(2)}</td></tr>
      <tr><td>Paid:</td><td class="right">${currency} ${sale.paidAmount.toFixed(2)}</td></tr>
      ${sale.remainingAmount > 0 ? `<tr><td>Balance:</td><td class="right">${currency} ${sale.remainingAmount.toFixed(2)}</td></tr>` : ''}
    </table>
    <hr>
    <div class="center">${settings['invoice.footerNote'] || 'Thank you!'}</div>
    <script>
      window.onload = () => { window.print(); }
    </script>
  </body></html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}
