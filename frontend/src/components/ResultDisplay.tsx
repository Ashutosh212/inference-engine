import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Prediction {
  class_name: string
  confidence: number
}

interface Props {
  result: {
    request_id?: string
    job_id?: string
    predictions?: {
      predictions: Prediction[]
      model: string
      version: string
      input_tensor_shape: number[] | null
      num_patches_processed: number
    }
    inference_ms?: number
    total_latency_ms?: number
    created_at?: string
  }
}

export default function ResultDisplay({ result }: Props) {
  const [showRaw, setShowRaw] = useState(false)
  const preds = result.predictions?.predictions ?? []

  return (
    <div className="space-y-4">
      {/* Predictions */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Predictions</h3>
        <div className="space-y-3">
          {preds.map((p, i) => (
            <div key={i}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-gray-700 capitalize">{p.class_name}</span>
                <span className="text-gray-500 font-mono">{(p.confidence * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${p.confidence * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Meta */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm space-y-2">
        <h3 className="font-semibold text-gray-700 mb-2">Metadata</h3>
        <MetaRow label="Request ID" value={result.request_id ?? result.job_id ?? '--'} mono />
        <MetaRow label="Model" value={`${result.predictions?.model} v${result.predictions?.version}`} />
        <MetaRow label="Inference" value={result.inference_ms != null ? `${result.inference_ms}ms` : '--'} />
        <MetaRow label="Total latency" value={result.total_latency_ms != null ? `${result.total_latency_ms}ms` : '--'} />
        <MetaRow label="Tensor shape" value={JSON.stringify(result.predictions?.input_tensor_shape)} mono />
        <MetaRow label="Patches" value={String(result.predictions?.num_patches_processed ?? 0)} />
      </div>

      {/* Raw JSON */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 text-sm font-medium text-gray-600 transition-colors"
          onClick={() => setShowRaw(!showRaw)}
        >
          Raw JSON
          {showRaw ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {showRaw && (
          <pre className="p-4 bg-gray-950 text-green-400 text-xs overflow-auto max-h-80 font-mono">
            {JSON.stringify(result, null, 2)}
          </pre>
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
