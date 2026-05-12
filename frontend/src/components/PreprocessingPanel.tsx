import { useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { formatMs } from '../lib/utils'

type StepOutput = Record<string, unknown>

interface Props {
  preprocessing: {
    steps_completed: string[]
    step_timings: Record<string, number>
    step_outputs: Record<string, StepOutput>
    total_preprocessing_ms: number
    errors: { step: string; error: string }[]
  }
}

export default function PreprocessingPanel({ preprocessing }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const allSteps = Object.keys(preprocessing.step_timings)
  const errorMap = Object.fromEntries(preprocessing.errors.map((e) => [e.step, e.error]))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
        <span>{preprocessing.steps_completed.length} steps completed</span>
        <span className="flex items-center gap-1">
          <Clock size={14} />
          {formatMs(preprocessing.total_preprocessing_ms)} total
        </span>
      </div>

      {allSteps.map((stepName) => {
        const completed = preprocessing.steps_completed.includes(stepName)
        const error = errorMap[stepName]
        const timing = preprocessing.step_timings[stepName]
        const output = preprocessing.step_outputs[stepName]
        const isOpen = expanded === stepName

        return (
          <div key={stepName} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 text-left transition-colors"
              onClick={() => setExpanded(isOpen ? null : stepName)}
            >
              {error ? (
                <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
              ) : completed ? (
                <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
              )}
              <span className="flex-1 font-medium text-sm text-gray-700 capitalize">{stepName.replace(/_/g, ' ')}</span>
              <span className="text-xs text-gray-400 font-mono">{timing != null ? `${timing}ms` : '--'}</span>
              {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                {error && (
                  <p className="text-red-600 text-sm mb-2">{error}</p>
                )}
                {output && (
                  <StepOutputView output={output} stepName={stepName} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepOutputView({ output, stepName }: { output: StepOutput; stepName: string }) {
  if (stepName === 'resize' && output) {
    const from = output.from as number[]
    const to = output.to as number[]
    return (
      <div className="text-sm space-y-1">
        <Row label="From" value={`${from?.[0]} x ${from?.[1]}`} />
        <Row label="To" value={`${to?.[0]} x ${to?.[1]}`} />
        <Row label="Method" value={String(output.method)} />
        <Row label="Padded" value={String(output.padded)} />
      </div>
    )
  }
  if (stepName === 'decode' && output) {
    return (
      <div className="text-sm space-y-1">
        <Row label="Width" value={String(output.width)} />
        <Row label="Height" value={String(output.height)} />
        <Row label="Mode" value={String(output.mode)} />
        <Row label="Channels" value={String(output.channels)} />
      </div>
    )
  }
  if (stepName === 'normalize' && output) {
    const range = output.pixel_range as number[]
    return (
      <div className="text-sm space-y-1">
        <Row label="Method" value={String(output.method)} />
        <Row label="Shape" value={JSON.stringify(output.shape)} />
        <Row label="Dtype" value={String(output.dtype)} />
        <Row label="Pixel range" value={`[${range?.[0]?.toFixed(2)}, ${range?.[1]?.toFixed(2)}]`} />
      </div>
    )
  }
  if (stepName === 'patch' && output) {
    return (
      <div className="text-sm space-y-1">
        <Row label="Num patches" value={String(output.num_patches)} />
        <Row label="Patch size" value={`${output.patch_size} x ${output.patch_size}`} />
        <Row label="Grid" value={JSON.stringify(output.patch_grid)} />
        <Row label="Patch dim" value={String(output.patch_dim)} />
        <Row label="Overlapping" value={String(output.overlapping)} />
      </div>
    )
  }
  if (stepName === 'tensorize' && output) {
    return (
      <div className="text-sm space-y-1">
        <Row label="Shape" value={JSON.stringify(output.shape)} />
        <Row label="Dtype" value={String(output.dtype)} />
        <Row label="From" value={String(output.from)} />
      </div>
    )
  }
  return (
    <pre className="text-xs text-gray-600 bg-white p-2 rounded border border-gray-200 overflow-auto">
      {JSON.stringify(output, null, 2)}
    </pre>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-gray-700">{value}</span>
    </div>
  )
}
