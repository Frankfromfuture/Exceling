import type * as XLSX from 'xlsx'
import { unzipSync, strFromU8 } from 'fflate'
import type { FrameRegion } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface BorderSide {
  style?: string
  rgb?: string         // resolved RRGGBB (no alpha)
}
interface ParsedBorder {
  top?: BorderSide
  bottom?: BorderSide
  left?: BorderSide
  right?: BorderSide
}
interface ParsedStyles {
  borders: ParsedBorder[]
  cellXf: Array<{ borderId: number; fillId: number }>
  fills: Array<{ fgRgb?: string; bgRgb?: string }>
}

// ─────────────────────────────────────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize any hex color string to 6-char RRGGBB */
function normalizeRgb(hex: string): string | null {
  if (!hex) return null
  const h = hex.replace(/^#/, '')
  if (h.length === 8) return h.slice(2)   // AARRGGBB → RRGGBB
  if (h.length === 6) return h
  return null
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

/**
 * Purple fill detection tuned for Excel highlight cells.
 *
 * We intentionally keep this stricter than generic violet detection:
 * - hue must stay in the purple / purple-magenta band
 * - saturation must be meaningful
 * - red and blue both need to be present and both exceed green
 *
 * This avoids misclassifying blue accents or pink/red fills as "purple".
 */
function isPurple(hex6: string): boolean {
  const r = parseInt(hex6.slice(0, 2), 16)
  const g = parseInt(hex6.slice(2, 4), 16)
  const b = parseInt(hex6.slice(4, 6), 16)

  // Fast path: distinct magenta/purple tint
  if (r > g + 2 && b > g + 2) return true

  const [h, s, l] = rgbToHsl(r, g, b)

  const inPurpleHueBand = h >= 230 && h <= 355
  const isVisible = l >= 0.02 && l <= 0.99
  const hasEnoughSaturation = s >= 0.02

  return inPurpleHueBand && hasEnoughSaturation && isVisible
}

const INVISIBLE = new Set(['', 'none', 'hair'])

// ─────────────────────────────────────────────────────────────────────────────
// XML helpers — use getElementsByTagName (namespace-agnostic, reliable)
// ─────────────────────────────────────────────────────────────────────────────

function gbt(el: Element | Document, tag: string): HTMLCollectionOf<Element> {
  return el.getElementsByTagName(tag) as unknown as HTMLCollectionOf<Element>
}

/**
 * Parse xl/theme/theme1.xml → RRGGBB keyed by theme index (0-based).
 * Uses indexOf instead of regex capture groups to avoid the ECMAScript
 * character-class escape normalization issue (\s\S stripped in new RegExp()).
 * Also namespace-prefix-agnostic (handles both <a:accent5> and <accent5>).
 *
 * OOXML theme color order:
 *   0=dk1  1=lt1  2=dk2  3=lt2
 *   4=accent1 … 9=accent6  10=hlink  11=folHlink
 */
function parseThemeColors(xml: string): Record<number, string> {
  const ORDER = ['dk1','lt1','dk2','lt2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink']
  const map: Record<number, string> = {}

  for (let i = 0; i < ORDER.length; i++) {
    const name = ORDER[i]
    // Find opening tag (with optional namespace prefix like a:accent5)
    const openRe = new RegExp(`<[a-zA-Z]*:?${name}[> /]`)
    const openM = xml.match(openRe)
    if (!openM || openM.index == null) continue

    // Extract block content up to closing tag using indexOf
    const blockStart = openM.index + openM[0].length
    const closeIdx = xml.indexOf(`${name}>`, blockStart)
    const block = closeIdx !== -1
      ? xml.slice(blockStart, closeIdx)
      : xml.slice(blockStart, blockStart + 300)

    // <a:srgbClr val="RRGGBB"/>
    const srgb = block.match(/srgbClr[^>]+val="([0-9A-Fa-f]{6})"/)
    if (srgb) { map[i] = srgb[1].toUpperCase(); continue }

    // <a:sysClr ... lastClr="RRGGBB"/>
    const sys = block.match(/sysClr[^>]+lastClr="([0-9A-Fa-f]{6})"/)
    if (sys) { map[i] = sys[1].toUpperCase() }
  }

  console.debug('[LPF] Theme colors:', map)
  return map
}

/** Apply tint to RGB. tint in [-1,1]. */
function applyTint(hex6: string, tint: number): string {
  let r = parseInt(hex6.slice(0, 2), 16)
  let g = parseInt(hex6.slice(2, 4), 16)
  let b = parseInt(hex6.slice(4, 6), 16)
  if (tint > 0) {
    r = Math.round(r + (255 - r) * tint)
    g = Math.round(g + (255 - g) * tint)
    b = Math.round(b + (255 - b) * tint)
  } else if (tint < 0) {
    r = Math.round(r * (1 + tint))
    g = Math.round(g * (1 + tint))
    b = Math.round(b * (1 + tint))
  }
  return [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

/** Resolve a <color> element to a RRGGBB string, or null */
function resolveColor(
  colorEl: Element,
  themeColors: Record<number, string>,
): string | null {
  // Direct RGB attribute (most common for standard/custom colors)
  const rgb = colorEl.getAttribute('rgb')
  if (rgb) return normalizeRgb(rgb)

  // Theme color reference
  const themeAttr = colorEl.getAttribute('theme')
  if (themeAttr !== null) {
    const themeIdx = parseInt(themeAttr)
    const base = themeColors[themeIdx]
    if (!base) return null
    const tintAttr = colorEl.getAttribute('tint')
    const tint = tintAttr !== null ? parseFloat(tintAttr) : 0
    return tint !== 0 ? applyTint(base, tint) : base
  }

  return null
}

/** Parse xl/styles.xml → ParsedStyles */
function parseStylesXml(xml: string, themeColors: Record<number, string>): ParsedStyles {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')

  // ── Borders ──────────────────────────────────────────────────────────────
  const borders: ParsedBorder[] = []
  const borderContainers = gbt(doc, 'borders')
  const borderEls = borderContainers.length
    ? gbt(borderContainers[0], 'border')
    : gbt(doc, 'border')

  for (let i = 0; i < borderEls.length; i++) {
    const bEl = borderEls[i]
    const pb: ParsedBorder = {}
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const sEls = gbt(bEl, side)
      if (!sEls.length) continue
      const sEl = sEls[0]
      const style = sEl.getAttribute('style') ?? undefined
      const colorEls = gbt(sEl, 'color')
      const rgb = colorEls.length ? resolveColor(colorEls[0], themeColors) : null
      pb[side] = { style, rgb: rgb ?? undefined }
    }
    borders.push(pb)
  }

  // ── CellXfs ───────────────────────────────────────────────────────────────
  const cellXf: ParsedStyles['cellXf'] = []
  const xfsContainers = gbt(doc, 'cellXfs')
  const xfEls = xfsContainers.length
    ? gbt(xfsContainers[0], 'xf')
    : gbt(doc, 'xf')

  for (let i = 0; i < xfEls.length; i++) {
    const bId = xfEls[i].getAttribute('borderId')
    const fId = xfEls[i].getAttribute('fillId')
    cellXf.push({
      borderId: bId != null ? parseInt(bId) : 0,
      fillId:   fId != null ? parseInt(fId) : 0,
    })
  }

  // ── Fills ─────────────────────────────────────────────────────────────────
  const fills: ParsedStyles['fills'] = []
  const fillsContainers = gbt(doc, 'fills')
  const fillEls = fillsContainers.length
    ? gbt(fillsContainers[0], 'fill')
    : gbt(doc, 'fill')

  for (let i = 0; i < fillEls.length; i++) {
    const pf = gbt(fillEls[i], 'patternFill')[0]
    if (!pf) { fills.push({}); continue }
    const fgEls = gbt(pf, 'fgColor')
    const bgEls = gbt(pf, 'bgColor')
    fills.push({
      fgRgb: fgEls.length ? (resolveColor(fgEls[0], themeColors) ?? undefined) : undefined,
      bgRgb: bgEls.length ? (resolveColor(bgEls[0], themeColors) ?? undefined) : undefined,
    })
  }

  console.debug('[LPF] Parsed styles – borders:', borders.length, 'cellXf:', cellXf.length, 'fills:', fills.length)
  // Log any border with a color for inspection
  borders.forEach((b, i) => {
    const sides = (['top','bottom','left','right'] as const).filter(s => b[s]?.rgb)
    if (sides.length) console.debug(`[LPF]   border[${i}]:`, sides.map(s => `${s}=${b[s]?.style}#${b[s]?.rgb}`).join(' '))
  })

  return { borders, cellXf, fills }
}

// ─────────────────────────────────────────────────────────────────────────────
// Style fetchers
// ─────────────────────────────────────────────────────────────────────────────

/** Strategy 1: SheetJS internal workbook.Styles */
function getStylesFromWorkbook(workbook: XLSX.WorkBook): ParsedStyles | null {
  const s = (workbook as unknown as {
    Styles?: {
      CellXf?: Array<{ borderId?: number; fillId?: number }>
      Borders?: Array<{
        top?: { style?: string; color?: { rgb?: string } }
        bottom?: { style?: string; color?: { rgb?: string } }
        left?: { style?: string; color?: { rgb?: string } }
        right?: { style?: string; color?: { rgb?: string } }
      }>
      Fills?: Array<{ fgColor?: { rgb?: string }; bgColor?: { rgb?: string } }>
    }
  }).Styles

  if (!s?.CellXf?.length || !s?.Borders?.length) return null

  const borders: ParsedBorder[] = s.Borders.map(b => ({
    top:    b.top    ? { style: b.top.style,    rgb: b.top.color?.rgb    ? (normalizeRgb(b.top.color.rgb)    ?? undefined) : undefined } : undefined,
    bottom: b.bottom ? { style: b.bottom.style, rgb: b.bottom.color?.rgb ? (normalizeRgb(b.bottom.color.rgb) ?? undefined) : undefined } : undefined,
    left:   b.left   ? { style: b.left.style,   rgb: b.left.color?.rgb   ? (normalizeRgb(b.left.color.rgb)   ?? undefined) : undefined } : undefined,
    right:  b.right  ? { style: b.right.style,  rgb: b.right.color?.rgb  ? (normalizeRgb(b.right.color.rgb)  ?? undefined) : undefined } : undefined,
  }))

  console.debug('[LPF] SheetJS Styles available – borders:', borders.length)

  return {
    borders,
    cellXf: s.CellXf.map(x => ({ borderId: x.borderId ?? 0, fillId: x.fillId ?? 0 })),
    fills: (s.Fills ?? []).map(f => ({
      fgRgb: f.fgColor?.rgb ? (normalizeRgb(f.fgColor.rgb) ?? undefined) : undefined,
      bgRgb: f.bgColor?.rgb ? (normalizeRgb(f.bgColor.rgb) ?? undefined) : undefined,
    })),
  }
}

/** Strategy 2: Parse xl/styles.xml + xl/theme/theme1.xml from ZIP (no filter — safer) */
function getStylesFromZip(buffer: ArrayBuffer): ParsedStyles | null {
  try {
    const u8 = new Uint8Array(buffer)
    // Extract ALL files — avoids filter edge-cases (backslash paths, encoding)
    const unzipped = unzipSync(u8)

    const keys = Object.keys(unzipped)
    console.debug('[LPF] ZIP entries:', keys)

    // Find styles.xml case-insensitively and handle backslash paths
    const normalizeKey = (k: string) => k.replace(/\\/g, '/').toLowerCase()
    const stylesKey = keys.find(k => normalizeKey(k) === 'xl/styles.xml')
    const themeKey  = keys.find(k => normalizeKey(k) === 'xl/theme/theme1.xml')

    if (!stylesKey) {
      console.warn('[LPF] xl/styles.xml not found. Available:', keys)
      return null
    }

    const themeColors = themeKey ? parseThemeColors(strFromU8(unzipped[themeKey])) : {}
    return parseStylesXml(strFromU8(unzipped[stylesKey]), themeColors)
  } catch (e) {
    console.warn('[LPF] ZIP parse error:', e)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell address helper
// ─────────────────────────────────────────────────────────────────────────────

function addrToRC(addr: string): [number, number] | null {
  const m = addr.match(/^([A-Z]+)(\d+)$/)
  if (!m) return null
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return [col - 1, parseInt(m[2]) - 1]
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function detectPurpleFrame(
  workbook: XLSX.WorkBook,
  sheetName: string,
  rawBuffer: ArrayBuffer,
): FrameRegion | null {
  const ws = workbook.Sheets[sheetName]
  if (!ws) return null

  const styles =
    getStylesFromZip(rawBuffer) ??
    getStylesFromWorkbook(workbook)

  if (!styles) {
    console.warn('[LPF] Could not obtain any style data')
    return null
  }

  let minRow = Infinity, maxRow = -Infinity
  let minCol = Infinity, maxCol = -Infinity
  let found = false

  const expand = (addr: string) => {
    const rc = addrToRC(addr)
    if (!rc) return
    const [col, row] = rc
    if (col < minCol) minCol = col
    if (col > maxCol) maxCol = col
    if (row < minRow) minRow = row
    if (row > maxRow) maxRow = row
    found = true
  }

  for (const [addr, rawCell] of Object.entries(ws)) {
    if (addr.startsWith('!')) continue
    const cell = rawCell as XLSX.CellObject & { s?: number | any }
    if (!cell.s) continue

    if (typeof cell.s === 'object') {
      // SheetJS fallback object
      const sObj = cell.s
      if (sObj.fgColor?.rgb && isPurple(sObj.fgColor.rgb)) { expand(addr); continue }
      if (sObj.bgColor?.rgb && isPurple(sObj.bgColor.rgb)) { expand(addr); continue }

      // Check borders in object form
      for (const side of ['top', 'bottom', 'left', 'right']) {
        const bs = sObj[side] || (sObj.border && sObj.border[side])
        if (bs && bs.color?.rgb && !INVISIBLE.has(bs.style) && isPurple(bs.color.rgb)) {
          expand(addr); break
        }
      }
      continue
    }

    if (typeof cell.s === 'number') {
      const fmt    = styles.cellXf[cell.s]
      const border = fmt ? styles.borders[fmt.borderId] : undefined
      const fill   = fmt ? styles.fills[fmt.fillId]     : undefined

      // Check borders
      if (border) {
        for (const side of ['top', 'bottom', 'left', 'right'] as const) {
          const bs = border[side]
          if (!bs?.style || INVISIBLE.has(bs.style)) continue
          if (bs.rgb && isPurple(bs.rgb)) { expand(addr); break }
        }
      }

      // Check fill color — always run, not just when border didn't match
      if (fill?.fgRgb && isPurple(fill.fgRgb)) { expand(addr) }
      else if (fill?.bgRgb && isPurple(fill.bgRgb)) { expand(addr) }
    }
  }

  if (!found) {
    console.warn('[LPF] No purple border/fill detected.',
      `Scanned ${Object.keys(ws).filter(k => !k.startsWith('!')).length} cells.`,
      `styles.borders sample:`, styles.borders.slice(0, 5))
  } else {
    console.info(`[LPF] Purple frame found: rows ${minRow}–${maxRow}, cols ${minCol}–${maxCol}`)
  }

  return found ? { minRow, maxRow, minCol, maxCol } : null
}

/**
 * Return the set of cell addresses that have a purple FILL color.
 * These are the user-marked "start / end" cells.
 * Reuses the same styles already parsed for the frame detection.
 */
export function detectMarkedCells(
  workbook: XLSX.WorkBook,
  sheetName: string,
  rawBuffer: ArrayBuffer,
): Set<string> {
  const ws = workbook.Sheets[sheetName]
  if (!ws) return new Set()

  const styles =
    getStylesFromZip(rawBuffer) ??
    getStylesFromWorkbook(workbook)

  if (!styles) return new Set()

  const marked = new Set<string>()
  for (const [addr, rawCell] of Object.entries(ws)) {
    if (addr.startsWith('!')) continue
    const cell = rawCell as XLSX.CellObject & { s?: number | any }
    if (!cell.s) continue

    if (typeof cell.s === 'object') {
      const sObj = cell.s
      if (sObj.fgColor?.rgb && isPurple(sObj.fgColor.rgb)) { marked.add(addr); continue }
      if (sObj.bgColor?.rgb && isPurple(sObj.bgColor.rgb)) { marked.add(addr) }
      continue
    }

    if (typeof cell.s === 'number') {
      const fmt  = styles.cellXf[cell.s]
      const fill = fmt ? styles.fills[fmt.fillId] : undefined
      if (fill?.fgRgb && isPurple(fill.fgRgb)) { marked.add(addr); continue }
      if (fill?.bgRgb && isPurple(fill.bgRgb)) { marked.add(addr) }
    }
  }

  console.debug('[LPF] Marked cells (purple fill):', [...marked])
  return marked
}
