// Seed script: populate demo data for Pharmacy Management System
// Run with: bun run db:seed
import { PrismaClient } from '@prisma/client'
import { hashPassword, DEFAULT_ROLE_PERMISSIONS } from '../src/lib/auth'
import { DEFAULT_SETTINGS } from '../src/lib/settings'

const db = new PrismaClient()

function rand(n: number) { return Math.floor(Math.random() * n) }
function pick<T>(arr: T[]): T { return arr[rand(arr.length)] }
function daysFromNow(d: number) {
  const dt = new Date()
  dt.setDate(dt.getDate() + d)
  return dt
}
function daysAgo(d: number) { return daysFromNow(-d) }
function money(n: number) { return Math.round(n * 100) / 100 }

const CATEGORIES = [
  'Antibiotics', 'Painkillers', 'Antacids', 'Cardiac', 'Diabetes', 'Vitamins',
  'Cough & Cold', 'Dermatology', 'Eye/Ear Drops', 'Supplements', 'Antiseptic',
  'Injectables', 'Baby Care', 'First Aid',
]

const SUPPLIERS = [
  { name: 'GlaxoSmithKline PK', company: 'GSK Pakistan', phone: '042-111-245-111' },
  { name: 'Abbott Laboratories', company: 'Abbott Pakistan', phone: '042-111-111-223' },
  { name: 'Searle Pharma', company: 'Searle Co.', phone: '021-111-111-224' },
  { name: 'Getz Pharma', company: 'Getz Bros', phone: '021-111-438-438' },
  { name: 'Martin Dow', company: 'Martin Dow Ltd', phone: '042-111-111-666' },
  { name: 'Sanofi Aventis', company: 'Sanofi PK', phone: '021-111-726-634' },
  { name: 'Hilton Pharma', company: 'Hilton Pharma', phone: '021-111-445-566' },
]

const CUSTOMERS = [
  { name: 'Walk-in Customer', phone: '', address: '' },
  { name: 'Ahmed Khan', phone: '0300-1234567', address: 'F-12, Islamabad' },
  { name: 'Fatima Bibi', phone: '0333-9876543', address: 'Gulberg, Lahore' },
  { name: 'Dr. Imran Clinic', phone: '042-3555-1122', address: 'Johar Town, Lahore' },
  { name: 'Rehman Medical Hall', phone: '042-3712-4455', address: 'Anarkali, Lahore' },
  { name: 'Sanaullah Pharmacy', phone: '042-3577-9988', address: 'Model Town, Lahore' },
  { name: 'Bilal Ahmad', phone: '0321-1112233', address: 'DHA Phase 5, Lahore' },
  { name: 'Zainab Noor', phone: '0345-5551122', address: 'Bahria Town, Lahore' },
  { name: 'Shifa Clinic', phone: '042-3588-2200', address: 'Township, Lahore' },
  { name: 'Kamran Stores', phone: '0301-9988776', address: 'Liberty Market, Lahore' },
]

// 30+ medicines with realistic Pakistani pharmacy names
const MEDICINES = [
  { name: 'Panadol Extra', generic: 'Paracetamol + Caffeine', manufacturer: 'GSK', cat: 'Painkillers', unit: 'TABLET', box: 100, strip: 10, retail: 5.0, stripPrice: 50, boxPrice: 480, prescription: false },
  { name: 'Augmentin 625mg', generic: 'Co-amoxiclav', manufacturer: 'GSK', cat: 'Antibiotics', unit: 'TABLET', box: 100, strip: 10, retail: 32.5, stripPrice: 325, boxPrice: 3200, prescription: true },
  { name: 'Augmentin Syrup', generic: 'Co-amoxiclav Suspension', manufacturer: 'GSK', cat: 'Antibiotics', unit: 'BOTTLE', box: 1, strip: 1, retail: 180, stripPrice: 180, boxPrice: 180, prescription: true },
  { name: 'Brufen 400mg', generic: 'Ibuprofen', manufacturer: 'Abbott', cat: 'Painkillers', unit: 'TABLET', box: 100, strip: 10, retail: 12.0, stripPrice: 120, boxPrice: 1150, prescription: false },
  { name: 'Risek 20mg', generic: 'Omeprazole', manufacturer: 'Getz Pharma', cat: 'Antacids', unit: 'CAPSULE', box: 100, strip: 10, retail: 14.0, stripPrice: 140, boxPrice: 1350, prescription: false },
  { name: 'Risek 40mg', generic: 'Omeprazole', manufacturer: 'Getz Pharma', cat: 'Antacids', unit: 'CAPSULE', box: 100, strip: 10, retail: 22.0, stripPrice: 220, boxPrice: 2150, prescription: false },
  { name: 'Calpol 250 Syrup', generic: 'Paracetamol Suspension', manufacturer: 'GSK', cat: 'Painkillers', unit: 'BOTTLE', box: 1, strip: 1, retail: 65, stripPrice: 65, boxPrice: 65, prescription: false },
  { name: 'Disprol Tablet', generic: 'Paracetamol Soluble', manufacturer: 'GSK', cat: 'Painkillers', unit: 'TABLET', box: 100, strip: 10, retail: 3.5, stripPrice: 35, boxPrice: 320, prescription: false },
  { name: 'Flagyl 400mg', generic: 'Metronidazole', manufacturer: 'Sanofi', cat: 'Antibiotics', unit: 'TABLET', box: 100, strip: 10, retail: 4.5, stripPrice: 45, boxPrice: 420, prescription: true },
  { name: 'Glucophage 500mg', generic: 'Metformin', manufacturer: 'Merck', cat: 'Diabetes', unit: 'TABLET', box: 100, strip: 10, retail: 5.5, stripPrice: 55, boxPrice: 520, prescription: true },
  { name: 'Glucophage 850mg', generic: 'Metformin', manufacturer: 'Merck', cat: 'Diabetes', unit: 'TABLET', box: 100, strip: 10, retail: 8.5, stripPrice: 85, boxPrice: 820, prescription: true },
  { name: 'Concor 5mg', generic: 'Bisoprolol', manufacturer: 'Merck', cat: 'Cardiac', unit: 'TABLET', box: 100, strip: 10, retail: 18.0, stripPrice: 180, boxPrice: 1750, prescription: true },
  { name: 'Tenormin 50mg', generic: 'Atenolol', manufacturer: 'Searle', cat: 'Cardiac', unit: 'TABLET', box: 100, strip: 10, retail: 9.5, stripPrice: 95, boxPrice: 920, prescription: true },
  { name: 'Lipitor 20mg', generic: 'Atorvastatin', manufacturer: 'Hilton', cat: 'Cardiac', unit: 'TABLET', box: 30, strip: 10, retail: 28.0, stripPrice: 280, boxPrice: 800, prescription: true },
  { name: 'Centrum Women', generic: 'Multivitamin', manufacturer: 'Pfizer', cat: 'Vitamins', unit: 'TABLET', box: 30, strip: 10, retail: 45.0, stripPrice: 450, boxPrice: 1300, prescription: false },
  { name: 'Surbex-Z', generic: 'Multivitamin + Zinc', manufacturer: 'Abbott', cat: 'Vitamins', unit: 'TABLET', box: 30, strip: 10, retail: 6.5, stripPrice: 65, boxPrice: 190, prescription: false },
  { name: 'Cetirizine 10mg', generic: 'Cetirizine', manufacturer: 'Hilton', cat: 'Cough & Cold', unit: 'TABLET', box: 100, strip: 10, retail: 2.5, stripPrice: 25, boxPrice: 230, prescription: false },
  { name: 'Actifed Syrup', generic: 'Triprolidine + Pseudoephedrine', manufacturer: 'GSK', cat: 'Cough & Cold', unit: 'BOTTLE', box: 1, strip: 1, retail: 78, stripPrice: 78, boxPrice: 78, prescription: false },
  { name: 'Cough Syrup Honey', generic: 'Honey + Menthol', manufacturer: 'Martin Dow', cat: 'Cough & Cold', unit: 'BOTTLE', box: 1, strip: 1, retail: 95, stripPrice: 95, boxPrice: 95, prescription: false },
  { name: 'Polyfax Skin Ointment', generic: 'Polymyxin + Bacitracin', manufacturer: 'GSK', cat: 'Dermatology', unit: 'TUBE', box: 1, strip: 1, retail: 145, stripPrice: 145, boxPrice: 145, prescription: false },
  { name: 'Polyfax Eye Ointment', generic: 'Polymyxin + Bacitracin', manufacturer: 'GSK', cat: 'Eye/Ear Drops', unit: 'TUBE', box: 1, strip: 1, retail: 165, stripPrice: 165, boxPrice: 165, prescription: false },
  { name: 'Tobrex Eye Drops', generic: 'Tobramycin', manufacturer: 'Alcon', cat: 'Eye/Ear Drops', unit: 'BOTTLE', box: 1, strip: 1, retail: 240, stripPrice: 240, boxPrice: 240, prescription: true },
  { name: 'Voltral 50mg', generic: 'Diclofenac Sodium', manufacturer: 'Novartis', cat: 'Painkillers', unit: 'TABLET', box: 100, strip: 10, retail: 7.5, stripPrice: 75, boxPrice: 720, prescription: true },
  { name: 'Voltral Gel', generic: 'Diclofenac Diethylamine', manufacturer: 'Novartis', cat: 'Dermatology', unit: 'TUBE', box: 1, strip: 1, retail: 190, stripPrice: 190, boxPrice: 190, prescription: false },
  { name: 'Dettol Antiseptic', generic: 'Chloroxylenol', manufacturer: 'Reckitt', cat: 'Antiseptic', unit: 'BOTTLE', box: 1, strip: 1, retail: 320, stripPrice: 320, boxPrice: 320, prescription: false },
  { name: 'Safeguard Soap', generic: 'Antibacterial Soap', manufacturer: 'P&G', cat: 'Baby Care', unit: 'PIECE', box: 72, strip: 1, retail: 95, stripPrice: 95, boxPrice: 6000, prescription: false },
  { name: 'Band-Aid (10s)', generic: 'Adhesive Bandages', manufacturer: 'J&J', cat: 'First Aid', unit: 'PIECE', box: 24, strip: 1, retail: 110, stripPrice: 110, boxPrice: 2400, prescription: false },
  { name: 'Insulin Lantus', generic: 'Insulin Glargine', manufacturer: 'Sanofi', cat: 'Injectables', unit: 'BOTTLE', box: 1, strip: 1, retail: 850, stripPrice: 850, boxPrice: 850, prescription: true },
  { name: 'Insulin Novomix 30', generic: 'Insulin Aspart', manufacturer: 'Novo', cat: 'Injectables', unit: 'BOTTLE', box: 1, strip: 1, retail: 720, stripPrice: 720, boxPrice: 720, prescription: true },
  { name: 'Ventolin Inhaler', generic: 'Salbutamol', manufacturer: 'GSK', cat: 'Cough & Cold', unit: 'PIECE', box: 1, strip: 1, retail: 480, stripPrice: 480, boxPrice: 480, prescription: true },
  { name: 'Ventolin Tablet 2mg', generic: 'Salbutamol', manufacturer: 'GSK', cat: 'Cough & Cold', unit: 'TABLET', box: 100, strip: 10, retail: 3.2, stripPrice: 32, boxPrice: 300, prescription: false },
  { name: 'Evion 400mg', generic: 'Vitamin E', manufacturer: 'Abbott', cat: 'Vitamins', unit: 'CAPSULE', box: 100, strip: 10, retail: 9.5, stripPrice: 95, boxPrice: 920, prescription: false },
  { name: 'Vitamin C 500mg', generic: 'Ascorbic Acid', manufacturer: 'Hilton', cat: 'Vitamins', unit: 'TABLET', box: 100, strip: 10, retail: 2.8, stripPrice: 28, boxPrice: 270, prescription: false },
  { name: 'Calcium Sandoz', generic: 'Calcium Carbonate', manufacturer: 'Novartis', cat: 'Supplements', unit: 'TABLET', box: 30, strip: 10, retail: 12.0, stripPrice: 120, boxPrice: 350, prescription: false },
  { name: 'ORS Sachet', generic: 'Oral Rehydration Salts', manufacturer: 'Hilton', cat: 'First Aid', unit: 'PIECE', box: 100, strip: 1, retail: 35, stripPrice: 35, boxPrice: 3200, prescription: false },
  { name: 'Lactobacillus Sachet', generic: 'Probiotic', manufacturer: 'Getz Pharma', cat: 'Antacids', unit: 'PIECE', box: 10, strip: 1, retail: 145, stripPrice: 145, boxPrice: 1400, prescription: false },
]

const EXPENSES = [
  { cat: 'RENT', amount: 65000, desc: 'Shop rent September' },
  { cat: 'ELECTRICITY', amount: 18500, desc: 'Lesco bill' },
  { cat: 'SALARIES', amount: 95000, desc: 'Staff salaries' },
  { cat: 'INTERNET', amount: 4500, desc: 'Nayatel monthly' },
  { cat: 'TRANSPORT', amount: 3200, desc: 'Courier medicines' },
  { cat: 'MAINTENANCE', amount: 2200, desc: 'AC servicing' },
  { cat: 'MISC', amount: 1500, desc: 'Stationery' },
]

async function main() {
  console.log('Clearing existing data...')
  // delete in dependency order
  await db.stockTransaction.deleteMany()
  await db.salesReturnItem.deleteMany()
  await db.salesReturn.deleteMany()
  await db.purchaseReturnItem.deleteMany()
  await db.purchaseReturn.deleteMany()
  await db.salePayment.deleteMany()
  await db.saleItem.deleteMany()
  await db.sale.deleteMany()
  await db.customerPayment.deleteMany()
  await db.supplierPayment.deleteMany()
  await db.purchaseItem.deleteMany()
  await db.purchase.deleteMany()
  await db.expense.deleteMany()
  await db.notification.deleteMany()
  await db.auditLog.deleteMany()
  await db.draftPO.deleteMany()
  await db.loyaltyTransaction.deleteMany()
  await db.medicineBatch.deleteMany()
  await db.medicine.deleteMany()
  await db.category.deleteMany()
  await db.supplier.deleteMany()
  await db.customer.deleteMany()
  await db.setting.deleteMany()
  await db.user.deleteMany()
  await db.role.deleteMany()
  await db.backup.deleteMany()

  console.log('Creating roles...')
  const adminRole = await db.role.create({
    data: {
      name: 'ADMIN',
      description: 'Full system access',
      isSystem: true,
      permissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
    },
  })
  const managerRole = await db.role.create({
    data: {
      name: 'MANAGER',
      description: 'Manage daily operations',
      isSystem: true,
      permissions: DEFAULT_ROLE_PERMISSIONS.MANAGER,
    },
  })
  const cashierRole = await db.role.create({
    data: {
      name: 'CASHIER',
      description: 'POS and basic access',
      isSystem: true,
      permissions: DEFAULT_ROLE_PERMISSIONS.CASHIER,
    },
  })

  console.log('Creating users...')
  const adminUser = await db.user.create({
    data: {
      email: 'admin@pharmacy.pk',
      name: 'System Administrator',
      phone: '0300-0000001',
      passwordHash: hashPassword('admin123'),
      roleId: adminRole.id,
      isActive: true,
    },
  })
  await db.user.create({
    data: {
      email: 'manager@pharmacy.pk',
      name: 'Imran Malik (Manager)',
      phone: '0300-0000002',
      passwordHash: hashPassword('manager123'),
      roleId: managerRole.id,
    },
  })
  await db.user.create({
    data: {
      email: 'cashier@pharmacy.pk',
      name: 'Bilal Cashier',
      phone: '0300-0000003',
      passwordHash: hashPassword('cashier123'),
      roleId: cashierRole.id,
    },
  })

  console.log('Seeding settings...')
  await db.setting.createMany({
    data: Object.entries(DEFAULT_SETTINGS).map(([k, v]) => ({ key: k, value: v })),
  })

  console.log('Creating categories...')
  const categoryMap: Record<string, string> = {}
  for (const c of CATEGORIES) {
    const cat = await db.category.create({ data: { name: c } })
    categoryMap[c] = cat.id
  }

  console.log('Creating suppliers...')
  const supplierMap: Record<string, string> = {}
  for (const s of SUPPLIERS) {
    const sup = await db.supplier.create({
      data: {
        name: s.name, company: s.company, phone: s.phone,
        openingBalance: rand(8) === 0 ? 15000 : 0,
      },
    })
    supplierMap[s.name] = sup.id
  }

  console.log('Creating customers...')
  const customerMap: Record<string, string> = {}
  for (const c of CUSTOMERS) {
    const cu = await db.customer.create({ data: { name: c.name, phone: c.phone, address: c.address } })
    customerMap[c.name] = cu.id
  }

  console.log('Creating medicines + batches...')
  const medList: { id: string; name: string; box: number; strip: number; retail: number; unit: string }[] = []
  for (let i = 0; i < MEDICINES.length; i++) {
    const m = MEDICINES[i]
    const barcode = `89000000${String(10000 + i).padStart(6, '0')}`
    const medicine = await db.medicine.create({
      data: {
        name: m.name,
        genericName: m.generic,
        manufacturer: m.manufacturer,
        categoryId: categoryMap[m.cat],
        barcode,
        unitType: m.unit,
        purchasePrice: m.retail * 0.75,
        retailPrice: m.retail,
        stripPrice: m.stripPrice,
        boxPrice: m.boxPrice,
        minStock: m.box * 0.2,
        maxStock: m.box * 5,
        rackLocation: `R${rand(20) + 1}-S${rand(8) + 1}`,
        prescriptionRequired: m.prescription,
        isActive: true,
      },
    })
    medList.push({ id: medicine.id, name: m.name, box: m.box, strip: m.strip, retail: m.retail, unit: m.unit })

    // create 1-2 batches per medicine with varied expiry dates
    const sup = pick(SUPPLIERS)
    const b1Expiry = daysFromNow(pick([-15, 10, 25, 50, 120, 200, 365])) // some expired, some near, some safe
    const qty1 = rand(4) === 0 ? rand(8) : rand(200) + 20 // sometimes low
    await db.medicineBatch.create({
      data: {
        medicineId: medicine.id,
        batchNumber: `B${String(i + 1).padStart(3, '0')}A`,
        expiryDate: b1Expiry,
        packSizeBox: m.box,
        packSizeStrip: m.strip,
        quantity: qty1,
        purchasePrice: m.retail * 0.75,
        salePrice: m.retail,
        supplierId: supplierMap[sup.name],
      },
    })
    // second batch
    if (rand(3) > 0) {
      const sup2 = pick(SUPPLIERS)
      await db.medicineBatch.create({
        data: {
          medicineId: medicine.id,
          batchNumber: `B${String(i + 1).padStart(3, '0')}B`,
          expiryDate: daysFromNow(pick([60, 180, 300, 400])),
          packSizeBox: m.box,
          packSizeStrip: m.strip,
          quantity: rand(150) + 10,
          purchasePrice: m.retail * 0.78,
          salePrice: m.retail,
          supplierId: supplierMap[sup2.name],
        },
      })
    }

    // record initial stock transaction for first batch
    await db.stockTransaction.create({
      data: {
        medicineId: medicine.id,
        type: 'INITIAL',
        quantity: qty1,
        refType: 'Initial',
        notes: 'Initial stock',
      },
    })
  }

  console.log('Creating purchases...')
  for (let i = 0; i < 8; i++) {
    const sup = pick(SUPPLIERS)
    const items: any[] = []
    const numItems = rand(3) + 1
    let subtotal = 0
    for (let j = 0; j < numItems; j++) {
      const med = pick(medList)
      const qty = (rand(50) + 10) * 10
      const cost = med.retail * (0.7 + rand(20) / 100)
      const total = qty * cost
      subtotal += total
      items.push({
        medicineId: med.id,
        batchNumber: `PUR${i + 1}-${j + 1}`,
        expiryDate: daysFromNow(180 + rand(400)),
        quantity: qty,
        freeQuantity: rand(3) === 0 ? qty * 0.1 : 0,
        purchasePrice: cost,
        salePrice: med.retail,
        mrpPerUnit: med.retail,
        discount: 0,
        total,
        scheme: rand(3) === 0 ? '10+1' : null,
      })
    }
    const discount = rand(4) === 0 ? Math.round(subtotal * 0.05) : 0
    const total = subtotal - discount
    const paid = rand(3) === 0 ? total * 0.5 : total
    await db.purchase.create({
      data: {
        invoiceNumber: `PUR-${String(5001 + i).padStart(4, '0')}`,
        supplierId: supplierMap[sup.name],
        userId: adminUser.id,
        invoiceDate: daysAgo(rand(30)),
        subtotal,
        discount,
        total,
        paidAmount: paid,
        status: paid >= total ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'UNPAID'),
        items: { create: items },
      },
    })
  }

  console.log('Creating sales...')
  let saleCounter = 1001
  for (let i = 0; i < 60; i++) {
    const cust = rand(3) === 0 ? null : pick(CUSTOMERS)
    const items: any[] = []
    const numItems = rand(3) + 1
    let subtotal = 0
    let allowNegative = false
    for (let j = 0; j < numItems; j++) {
      const med = pick(medList)
      // find an in-stock batch (expiry-aware not required for seed, just pick a non-empty batch)
      const batches = await db.medicineBatch.findMany({ where: { medicineId: med.id } })
      const inStock = batches.filter(b => b.quantity > 0)
      if (inStock.length === 0) { continue }
      const batch = pick(inStock)
      const useStrip = rand(3) > 0 && med.unit === 'TABLET'
      let qty: number
      let unitFactor: number
      let unitType: string
      let unitPrice: number
      if (useStrip && med.strip > 1) {
        qty = (rand(5) + 1) * med.strip
        unitType = 'STRIP'
        unitFactor = med.strip
        unitPrice = med.retail * med.strip
      } else {
        qty = rand(20) + 1
        unitType = med.unit
        unitFactor = 1
        unitPrice = med.retail
      }
      if (qty > batch.quantity && !allowNegative) { qty = Math.max(1, batch.quantity) }
      const total = unitPrice * (qty / unitFactor)
      subtotal += total
      items.push({
        medicineId: med.id,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantity: qty,
        unitType,
        unitFactor,
        unitPrice,
        discount: 0,
        total,
      })
      // deduct stock
      await db.medicineBatch.update({ where: { id: batch.id }, data: { quantity: { decrement: qty } } })
      await db.stockTransaction.create({
        data: {
          medicineId: med.id,
          batchId: batch.id,
          type: 'SALE',
          quantity: -qty,
          refType: 'Sale',
        },
      })
    }
    if (items.length === 0) continue
    const discountAmt = rand(5) === 0 ? Math.round(subtotal * 0.05) : 0
    const total = subtotal - discountAmt
    const isCredit = rand(5) === 0 && cust && cust.name !== 'Walk-in Customer'
    const paid = isCredit ? 0 : total
    const paymentStatus = isCredit ? 'CREDIT' : 'PAID'
    const method = pick(['CASH', 'BANK', 'EASYPAISA', 'JAZZCASH', 'OTHER'])
    const sale = await db.sale.create({
      data: {
        invoiceNumber: `INV-${String(saleCounter++).padStart(4, '0')}`,
        customerId: cust ? customerMap[cust.name] : null,
        userId: adminUser.id,
        subtotal,
        discount: discountAmt,
        discountType: 'AMOUNT',
        tax: 0,
        total,
        paidAmount: paid,
        remainingAmount: total - paid,
        paymentStatus,
        items: { create: items },
        payments: isCredit ? undefined : { create: [{ method, amount: paid }] },
      },
    })
    // adjust customer via CustomerPayment if credit paid later (some paid)
    if (isCredit && rand(2) === 0) {
      const partial = Math.round(total * 0.5)
      await db.customerPayment.create({
        data: {
          customerId: customerMap[cust!.name],
          saleId: sale.id,
          amount: partial,
          method: 'CASH',
          userId: adminUser.id,
        },
      })
      await db.sale.update({
        where: { id: sale.id },
        data: { paidAmount: partial, remainingAmount: total - partial, paymentStatus: 'PARTIAL' },
      })
    }
  }

  console.log('Creating expenses (today + previous days)...')
  for (const e of EXPENSES) {
    // create a few entries across the past month
    for (let k = 0; k < (rand(3) + 1); k++) {
      await db.expense.create({
        data: {
          category: e.cat,
          amount: e.amount * (0.3 + rand(70) / 100),
          description: e.desc,
          date: daysAgo(rand(30)),
          userId: adminUser.id,
        },
      })
    }
  }
  // today's expense
  await db.expense.create({
    data: { category: 'MISC', amount: 850, description: 'Cleaning supplies today', date: new Date(), userId: adminUser.id },
  })

  console.log('Creating supplier payments...')
  for (let i = 0; i < 4; i++) {
    const sup = pick(SUPPLIERS)
    await db.supplierPayment.create({
      data: {
        supplierId: supplierMap[sup.name],
        amount: rand(20000) + 2000,
        method: pick(['CASH', 'BANK', 'EASYPAISA']),
        notes: 'Partial payment',
        userId: adminUser.id,
      },
    })
  }

  console.log('Generating notifications...')
  // we generate notifications dynamically at runtime; but seed a few system ones
  await db.notification.create({
    data: { type: 'SYSTEM', title: 'Welcome to Shifa Medical Store', message: 'Demo data loaded. Login as admin@pharmacy.pk / admin123', severity: 'INFO' },
  })

  console.log('Creating initial audit log...')
  await db.auditLog.create({
    data: { userId: adminUser.id, action: 'SYSTEM_SEED', entity: 'System', details: 'Seeded demo data' },
  })

  // Update next-number settings based on seeded data
  console.log('Updating invoice sequence counters...')
  const lastSale = await db.sale.findFirst({ orderBy: { invoiceNumber: 'desc' } })
  if (lastSale) {
    const m = lastSale.invoiceNumber.match(/(\d+)$/)
    if (m) await db.setting.upsert({ where: { key: 'invoice.nextNumber' }, update: { value: String(parseInt(m[1], 10) + 1) }, create: { key: 'invoice.nextNumber', value: String(parseInt(m[1], 10) + 1) } })
  }
  const lastPurchase = await db.purchase.findFirst({ orderBy: { invoiceNumber: 'desc' } })
  if (lastPurchase) {
    const m = lastPurchase.invoiceNumber.match(/(\d+)$/)
    if (m) await db.setting.upsert({ where: { key: 'purchase.nextNumber' }, update: { value: String(parseInt(m[1], 10) + 1) }, create: { key: 'purchase.nextNumber', value: String(parseInt(m[1], 10) + 1) } })
  }

  console.log('Seed completed!')
  console.log('Login: admin@pharmacy.pk / admin123')
  console.log('Login: manager@pharmacy.pk / manager123')
  console.log('Login: cashier@pharmacy.pk / cashier123')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
