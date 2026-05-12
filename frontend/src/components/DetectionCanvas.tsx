import { useRef, useEffect, useState, useCallback } from 'react'

export interface OBBPrediction {
  cx: number
  cy: number
  width: number
  height: number
  angle: number        // radians
  confidence: number
  class_id: number
  class_name: string
  tile_offset: [number, number]
}

interface HoverInfo {
  idx: number
  buttonX: number   // CSS px from canvas-left (top-right of AABB)
  buttonY: number   // CSS px from canvas-top  (top-right of AABB)
}

interface Props {
  imageFile: File
  predictions: OBBPrediction[]
  imageSize: [number, number]   // [W, H] from model output
  inferencems?: number
  numTiles?: number
}

const PALETTE = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B',
  '#10B981', '#6366F1', '#F43F5E', '#84CC16', '#0EA5E9',
]

function classColor(classId: number) {
  return PALETTE[classId % PALETTE.length]
}

// Returns the 4 rotated corner points of a box in canvas CSS coords
function boxCorners(
  cx: number, cy: number, w: number, h: number, angle: number,
): [number, number][] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return (
    [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as [number, number][]
  ).map(([dx, dy]) => [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos])
}

// True if the point (mx, my) lies inside the rotated rectangle
function hitTest(
  mx: number, my: number,
  p: OBBPrediction,
  sx: number, sy: number,
): boolean {
  const cx = p.cx * sx
  const cy = p.cy * sy
  const w = p.width * sx
  const h = p.height * sy
  const dx = mx - cx
  const dy = my - cy
  const cos = Math.cos(p.angle)
  const sin = Math.sin(p.angle)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  return Math.abs(localX) <= w / 2 && Math.abs(localY) <= h / 2
}

// Draw one OBB with optional label. alpha controls overall opacity.
function drawBox(
  ctx: CanvasRenderingContext2D,
  p: OBBPrediction,
  sx: number, sy: number,
  alpha: number,
  showLabel: boolean,
) {
  const color = classColor(p.class_id)
  const cx = p.cx * sx
  const cy = p.cy * sy
  const w = p.width * sx
  const h = p.height * sy

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(cx, cy)
  ctx.rotate(p.angle)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.strokeRect(-w / 2, -h / 2, w, h)
  ctx.fillStyle = color + '33'   // 20% fill, further dimmed by globalAlpha
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.restore()

  if (showLabel) {
    const corners = boxCorners(cx, cy, w, h, p.angle)
    const minY = Math.min(...corners.map(c => c[1]))
    const minX = Math.min(...corners.map(c => c[0]))
    const maxX = Math.max(...corners.map(c => c[0]))
    const labelCx = (minX + maxX) / 2
    const labelBottom = minY - 3

    const label = `${p.class_id} · ${(p.confidence * 100).toFixed(0)}%`
    const fontSize = 11
    ctx.font = `bold ${fontSize}px sans-serif`
    const tw = ctx.measureText(label).width
    const pad = 3

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(labelCx - tw / 2 - pad, labelBottom - fontSize - pad * 2, tw + pad * 2, fontSize + pad * 2, 3)
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.fillText(label, labelCx - tw / 2, labelBottom - pad)
  }
}

// Two-pass render: dim all boxes first, then draw hovered box on top at full opacity
function drawScene(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  predictions: OBBPrediction[],
  threshold: number,
  imgW: number,
  imgH: number,
  hoveredIdx: number | null,
  deletedIndices: Set<number>,
) {
  const dpr = window.devicePixelRatio || 1
  const cssW = canvas.parentElement?.clientWidth || 640
  const cssH = Math.round(cssW * imgH / imgW)

  canvas.width = cssW * dpr
  canvas.height = cssH * dpr
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`

  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  const sx = cssW / imgW
  const sy = cssH / imgH

  ctx.drawImage(img, 0, 0, cssW, cssH)

  // Pass 1: non-hovered boxes at 50% opacity, no label
  for (let i = 0; i < predictions.length; i++) {
    if (i === hoveredIdx || deletedIndices.has(i)) continue
    const p = predictions[i]
    if (p.confidence < threshold) continue
    drawBox(ctx, p, sx, sy, 0.5, false)
  }

  // Pass 2: hovered box drawn on top at full opacity with label
  if (hoveredIdx !== null) {
    const p = predictions[hoveredIdx]
    if (p && !deletedIndices.has(hoveredIdx) && p.confidence >= threshold) {
      drawBox(ctx, p, sx, sy, 1.0, true)
    }
  }
}

export default function DetectionCanvas({ imageFile, predictions, imageSize, inferencems, numTiles }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Prevents mousemove from clearing hover while the cursor is on the × button
  const isOverButtonRef = useRef(false)

  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [threshold, setThreshold] = useState(0.25)
  const [hovered, setHovered] = useState<HoverInfo | null>(null)
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set())
  const [imgW, imgH] = imageSize

  // Reset per-result state whenever predictions change (new inference run)
  useEffect(() => {
    setDeletedIndices(new Set())
    setHovered(null)
  }, [predictions])

  useEffect(() => {
    const url = URL.createObjectURL(imageFile)
    const img = new Image()
    img.onload = () => setImgEl(img)
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  useEffect(() => {
    if (!canvasRef.current || !imgEl) return
    drawScene(canvasRef.current, imgEl, predictions, threshold, imgW, imgH, hovered?.idx ?? null, deletedIndices)
  }, [imgEl, predictions, threshold, imgW, imgH, hovered, deletedIndices])

  // Mouse events on the container div so the × button doesn't break hover state
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isOverButtonRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const sx = rect.width / imgW
    const sy = rect.height / imgH

    // Iterate in reverse so topmost-drawn box wins on overlap
    for (let i = predictions.length - 1; i >= 0; i--) {
      const p = predictions[i]
      if (deletedIndices.has(i) || p.confidence < threshold) continue
      if (hitTest(mx, my, p, sx, sy)) {
        const cx = p.cx * sx
        const cy = p.cy * sy
        const w = p.width * sx
        const h = p.height * sy
        const corners = boxCorners(cx, cy, w, h, p.angle)
        const maxX = Math.max(...corners.map(c => c[0]))
        const minY = Math.min(...corners.map(c => c[1]))
        setHovered({ idx: i, buttonX: maxX, buttonY: minY })
        return
      }
    }
    setHovered(null)
  }, [predictions, threshold, deletedIndices, imgW, imgH])

  const handleMouseLeave = useCallback(() => {
    if (!isOverButtonRef.current) setHovered(null)
  }, [])

  const handleDelete = useCallback(() => {
    if (hovered === null) return
    setDeletedIndices(prev => new Set([...prev, hovered.idx]))
    setHovered(null)
    isOverButtonRef.current = false
  }, [hovered])

  const visible = predictions.filter((p, i) => !deletedIndices.has(i) && p.confidence >= threshold)

  // Build legend from visible predictions, keyed by class_id
  const classMap = new Map<number, { name: string; count: number }>()
  for (const p of visible) {
    const entry = classMap.get(p.class_id)
    if (entry) entry.count++
    else classMap.set(p.class_id, { name: p.class_name, count: 1 })
  }
  const legendEntries = [...classMap.entries()].sort(([a], [b]) => a - b)

  return (
    <div className="space-y-3">
      {/* Stats + confidence slider */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm text-gray-600 font-medium">
          {visible.length} / {predictions.length} detections
        </span>
        {inferencems != null && (
          <span className="text-xs text-gray-400">{inferencems}ms · {numTiles} tiles</span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-500">Confidence</span>
          <input
            type="range" min={0} max={1} step={0.01}
            value={threshold}
            onChange={e => setThreshold(parseFloat(e.target.value))}
            className="w-32 accent-blue-600"
          />
          <span className="text-xs font-mono text-gray-700 w-8 text-right">
            {(threshold * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Canvas + interaction layer */}
      <div
        ref={containerRef}
        className={`relative w-full border border-gray-200 bg-gray-100 rounded-lg ${hovered ? 'cursor-pointer' : 'cursor-crosshair'}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <canvas ref={canvasRef} className="w-full block rounded-lg" />

        {hovered !== null && (
          <button
            className="absolute flex items-center justify-center w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white font-bold shadow-md transition-colors"
            style={{
              left: hovered.buttonX - 10,
              top: hovered.buttonY - 10,
              fontSize: 14,
              lineHeight: 1,
            }}
            onMouseEnter={() => { isOverButtonRef.current = true }}
            onMouseLeave={() => { isOverButtonRef.current = false }}
            onClick={handleDelete}
            title="Remove this detection"
          >
            ×
          </button>
        )}
      </div>

      {/* Legend: class_id → class_name (populated from prediction data) */}
      {legendEntries.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-3 bg-white">
          <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Legend</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {legendEntries.map(([id, { name, count }]) => (
              <div key={id} className="flex items-center gap-1.5 text-xs">
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded text-white font-bold text-[10px] flex-shrink-0"
                  style={{ backgroundColor: classColor(id) }}
                >
                  {id}
                </span>
                <span className="text-gray-700 capitalize">{name}</span>
                <span className="text-gray-400">×{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {predictions.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">No detections above threshold</p>
      )}
    </div>
  )
}
