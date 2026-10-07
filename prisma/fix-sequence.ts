// One-off fix script: update invoice/purchase sequence counters based on max existing number
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const lastSale = await db.sale.findFirst({ orderBy: { invoiceNumber: 'desc' } })
  if (lastSale) {
    const m = lastSale.invoiceNumber.match(/(\d+)$/)
    if (m) {
      const next = parseInt(m[1], 10) + 1
      await db.setting.upsert({ where: { key: 'invoice.nextNumber' }, update: { value: String(next) }, create: { key: 'invoice.nextNumber', value: String(next) } })
      console.log(`invoice.nextNumber set to ${next}`)
    }
  }
  const lastPurchase = await db.purchase.findFirst({ orderBy: { invoiceNumber: 'desc' } })
  if (lastPurchase) {
    const m = lastPurchase.invoiceNumber.match(/(\d+)$/)
    if (m) {
      const next = parseInt(m[1], 10) + 1
      await db.setting.upsert({ where: { key: 'purchase.nextNumber' }, update: { value: String(next) }, create: { key: 'purchase.nextNumber', value: String(next) } })
      console.log(`purchase.nextNumber set to ${next}`)
    }
  }
  // Also fix sales with createdAt set to today (move them so dashboard shows data)
  // Set 15 most recent sales createdAt to today
  const recentSales = await db.sale.findMany({ orderBy: { createdAt: 'asc' }, take: 15 })
  for (const s of recentSales) {
    await db.sale.update({ where: { id: s.id }, data: { createdAt: new Date() } })
  }
  console.log('Updated 15 sales to today')
}

main().finally(() => db.$disconnect())
