import { useState } from 'react'
import { Play, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import ImageUploader from '../components/ImageUploader'
import PreprocessingPanel from '../components/PreprocessingPanel'
import DetectionCanvas from '../components/DetectionCanvas'
import { useInference, InferenceResult } from '../hooks/useInference'

interface HistoryEntry {
  file: File
  preview: string
  result: InferenceResult
  timestamp: Date
}

export default function Playground() {
  const [file, setFile] = useState<File | null>(null)
  const [asyncMode, setAsyncMode] = useState(false)
  const [showOverrides, setShowOverrides] = useState(false)
  const [overridesText, setOverridesText] = useState('{}')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showPreprocessing, setShowPreprocessing] = useState(false)
  const [showMeta, setShowMeta] = useState(false)
  const { run, loading, progress, error, result } = useInference()

  const [prevResult, setPrevResult] = useState<InferenceResult | null>(null)
  if (result !== prevResult) {
    setPrevResult(result)
    if (result && file) {
      setHistory(h => [{
        file,
        preview: URL.createObjectURL(file),
        result,
        timestamp: new Date(),
      }, ...h].slice(0, 10))
    }
  }

  const handleRun = async () => {
    if (!file) return
    let params: Record<string, unknown> | undefined
    try { params = JSON.parse(overridesText) } catch { params = undefined }
    await run(file, asyncMode, params)
  }

  const preds = result?.predictions?.predictions ?? []
  const imageSize = result?.predictions?.image_size ?? [0, 0]

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* ── Left panel ── */}
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Upload Image</h2>
          <ImageUploader file={file} onFile={setFile} />

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Async mode</span>
              <button
                onClick={() => setAsyncMode(!asyncMode)}
                className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${asyncMode ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${asyncMode ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            <div>
              <button
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
                onClick={() => setShowOverrides(!showOverrides)}
              >
                {showOverrides ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Pipeline overrides (optional)
              </button>
              {showOverrides && (
                <textarea
                  className="mt-2 w-full h-32 font-mono text-xs p-3 border border-gray-200 rounded-lg bg-gray-950 text-green-400 resize-none"
                  value={overridesText}
                  onChange={e => setOverridesText(e.target.value)}
                  spellCheck={false}
                />
              )}
            </div>

            <button
              onClick={handleRun}
              disabled={!file || loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin" />{progress || 'Processing...'}</>
              ) : (
                <><Play size={18} />Run Inference</>
              )}
            </button>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}
          </div>
        </div>

        {/* Recent runs */}
        {history.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Runs</h3>
            <div className="space-y-2">
              {history.map((entry, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <img src={entry.preview} alt="" className="w-10 h-10 object-cover rounded border border-gray-200" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{entry.file.name}</p>
                    <p className="text-xs text-gray-400">
                      {entry.result.predictions?.num_detections ?? 0} detections
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {entry.result.total_latency_ms != null ? `${entry.result.total_latency_ms}ms` : '--'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="space-y-4">
        {result && file && imageSize[0] > 0 ? (
          <>
            {/* Detection canvas */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Detections</h2>
              <DetectionCanvas
                imageFile={file}
                predictions={preds}
                imageSize={imageSize}
                inferencems={result.inference_ms}
                numTiles={result.predictions?.num_tiles}
              />
            </div>

            {/* Preprocessing pipeline — collapsible */}
            {result.preprocessing && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowPreprocessing(!showPreprocessing)}
                >
                  Preprocessing Pipeline
                  {showPreprocessing ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {showPreprocessing && (
                  <div className="px-5 pb-4">
                    <PreprocessingPanel preprocessing={result.preprocessing} />
                  </div>
                )}
              </div>
            )}

            {/* Metadata — collapsible */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                onClick={() => setShowMeta(!showMeta)}
              >
                Metadata
                {showMeta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {showMeta && (
                <div className="px-5 pb-4 text-sm space-y-2">
                  <MetaRow label="Request ID" value={result.request_id ?? '--'} mono />
                  <MetaRow label="Model" value={`${result.predictions?.model ?? '--'}`} />
                  <MetaRow label="Image size" value={`${imageSize[0]} × ${imageSize[1]}`} />
                  <MetaRow label="Tiles" value={String(result.predictions?.num_tiles ?? 0)} />
                  <MetaRow label="Inference" value={result.inference_ms != null ? `${result.inference_ms}ms` : '--'} />
                  <MetaRow label="Total latency" value={result.total_latency_ms != null ? `${result.total_latency_ms}ms` : '--'} />
                  {result.save_dir && <MetaRow label="Saved to" value={result.save_dir} mono />}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-10 shadow-sm flex flex-col items-center justify-center text-center text-gray-400 h-64">
            <Play size={32} className="mb-3 opacity-20" />
            <p className="text-sm">Upload an image and run inference to see results here</p>
          </div>
        )}
      </div>
    </div>
  )
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      <span className={`text-gray-700 truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}
