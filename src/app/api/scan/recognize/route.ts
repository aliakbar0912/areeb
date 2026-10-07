import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

// POST /api/scan/recognize
// Body: { image: "base64dataurl", barcode?: string }
// Returns: medicine fields extracted from image via VLM + confidence scores + duplicate check
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.permissions.includes('inventory.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { image, barcode } = body || {}
  if (!image || typeof image !== 'string' || !image.startsWith('data:')) {
    return NextResponse.json({ error: 'Valid base64 image (data URL) required' }, { status: 400 })
  }

  // Limit image size (~10MB base64 ~13.3M chars)
  if (image.length > 14_000_000) {
    return NextResponse.json({ error: 'Image too large. Max 10MB.' }, { status: 400 })
  }

  try {
    // Use VLM (vision language model) to extract medicine info from packaging
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const prompt = `You are a pharmacy inventory assistant. Analyze this image of a medicine box/packaging.
Extract the following fields if visible and return ONLY a JSON object (no markdown, no explanation):

{
  "medicineName": "brand/product name (e.g. Panadol)",
  "genericName": "generic/salt name (e.g. Paracetamol)",
  "strength": "strength with unit (e.g. 500mg, 250mg/5ml)",
  "manufacturer": "company/manufacturer name (e.g. GSK)",
  "packSize": "pack description (e.g. 20 Tablets, 100ml)",
  "batchNumber": "batch/lot number (e.g. ABC123)",
  "expiryDate": "expiry date in YYYY-MM-DD or MM/YYYY format if visible",
  "manufacturingDate": "mfg date if visible",
  "dosageForm": "tablet/syrup/capsule/injection/etc",
  "barcode": "barcode number if visible on packaging",
  "mrp": "maximum retail price if visible",
  "category": "best-guess category (Antibiotics, Painkillers, Antacids, Vitamins, etc.)",
  "confidence": {
    "medicineName": 0-100,
    "genericName": 0-100,
    "strength": 0-100,
    "manufacturer": 0-100,
    "packSize": 0-100,
    "batchNumber": 0-100,
    "expiryDate": 0-100,
    "barcode": 0-100
  },
  "overallConfidence": 0-100,
  "notes": "any additional observations"
}

Rules:
- Only include fields that are clearly visible. Use null for missing fields.
- Confidence scores: 90+ = very clear, 70-89 = readable, 50-69 = uncertain, <50 = barely visible.
- Do NOT invent or guess medicine information. If uncertain, set confidence low.
- This is for inventory identification only — no medical advice.
- Return ONLY the JSON, no markdown formatting.`

    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: prompt },
          { type: 'image_url' as const, image_url: { url: image } },
        ],
      },
    ]

    const response = await zai.chat.completions.createVision({
      model: 'glm-4.6v',
      messages: messages as any,
      thinking: { type: 'disabled' },
    })

    const reply = response.choices?.[0]?.message?.content || ''

    // Parse JSON from reply (handle markdown code blocks)
    let parsed: any = null
    try {
      // Try direct parse first
      parsed = JSON.parse(reply)
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim())
        } catch {}
      }
      // Try to find first { ... } block
      if (!parsed) {
        const braceMatch = reply.match(/\{[\s\S]*\}/)
        if (braceMatch) {
          try {
            parsed = JSON.parse(braceMatch[0])
          } catch {}
        }
      }
    }

    if (!parsed) {
      return NextResponse.json({
        error: 'Could not parse VLM response',
        rawReply: reply.slice(0, 500),
      }, { status: 422 })
    }

    // Override barcode with scanner-detected barcode if provided (higher confidence)
    if (barcode && !parsed.barcode) {
      parsed.barcode = barcode
      parsed.confidence = parsed.confidence || {}
      parsed.confidence.barcode = 99
    }

    // Duplicate detection: search existing medicines
    let duplicate = null
    const conditions: any[] = []

    // By barcode (most reliable)
    if (parsed.barcode) {
      conditions.push({ barcode: { contains: parsed.barcode } })
    }
    // By name + manufacturer
    if (parsed.medicineName && parsed.manufacturer) {
      conditions.push({
        AND: [
          { name: { contains: parsed.medicineName } },
          { manufacturer: { contains: parsed.manufacturer } },
        ],
      })
    }
    // By name alone (case insensitive)
    if (parsed.medicineName) {
      conditions.push({ name: { contains: parsed.medicineName } })
    }
    // By generic name
    if (parsed.genericName) {
      conditions.push({ genericName: { contains: parsed.genericName } })
    }

    if (conditions.length > 0) {
      const existing = await db.medicine.findFirst({
        where: { OR: conditions, isActive: true },
        include: { category: true, batches: true },
      })
      if (existing) {
        duplicate = {
          id: existing.id,
          name: existing.name,
          genericName: existing.genericName,
          manufacturer: existing.manufacturer,
          barcode: existing.barcode,
          retailPrice: existing.retailPrice,
          stock: existing.batches.reduce((s, b) => s + b.quantity, 0),
          categoryName: existing.category?.name,
        }
      }
    }

    // Log the scan
    await logAudit({
      userId: user.id,
      action: 'MEDICINE_SCAN',
      entity: 'Medicine',
      details: `Scanned: ${parsed.medicineName || 'Unknown'} ${parsed.strength || ''} (${parsed.manufacturer || '?'}) - Confidence: ${parsed.overallConfidence || 0}%`,
      req,
    })

    return NextResponse.json({
      recognized: parsed,
      duplicate,
      scannedAt: new Date().toISOString(),
      scannedBy: user.name,
    })
  } catch (err: any) {
    console.error('Scan recognition failed:', err)
    return NextResponse.json({
      error: 'Recognition failed',
      message: err?.message || 'Unknown error',
    }, { status: 500 })
  }
}
