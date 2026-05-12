import { useCallback, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { cn, formatBytes } from '../lib/utils'

interface Props {
  onFile: (file: File | null) => void
  file: File | null
}

export default function ImageUploader({ onFile, file }: Props) {
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (f: File) => {
      onFile(f)
      const url = URL.createObjectURL(f)
      setPreview(url)
      const img = new Image()
      img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight })
      img.src = url
    },
    [onFile]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files[0]
      if (f) handleFile(f)
    },
    [handleFile]
  )

  const clear = () => {
    onFile(null)
    setPreview(null)
    setImgDims(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (file && preview) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <div className="flex items-start gap-4">
          <img src={preview} alt="preview" className="w-24 h-24 object-cover rounded-md border border-gray-200" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-gray-800 truncate">{file.name}</p>
            <p className="text-xs text-gray-500 mt-1">{formatBytes(file.size)}</p>
            {imgDims && (
              <p className="text-xs text-gray-500">{imgDims.w} x {imgDims.h}px</p>
            )}
            <p className="text-xs text-gray-400 mt-1">{file.type}</p>
          </div>
          <button onClick={clear} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all select-none',
        dragging
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50'
      )}
    >
      <div className={cn('rounded-full p-3', dragging ? 'bg-blue-100' : 'bg-gray-100')}>
        <Upload size={24} className={dragging ? 'text-blue-500' : 'text-gray-400'} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-gray-700">Drop image here or click to browse</p>
        <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP, BMP, TIFF -- up to 20MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </div>
  )
}
