import { useState } from 'react'
import { Save, RotateCcw } from 'lucide-react'
import { updatePipeline } from '../api/client'

interface Step {
  name: string
  description: string
  version: string
  order: number
  enabled: boolean
  required: boolean
}

interface Props {
  steps: Step[]
  config: Record<string, unknown>
  onRefresh: () => void
}

export default function PipelineConfigurator({ steps, config, onRefresh }: Props) {
  const [editedConfig, setEditedConfig] = useState<string>(JSON.stringify(config, null, 2))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    try {
      setSaving(true)
      setError(null)
      const parsed = JSON.parse(editedConfig)
      await updatePipeline(parsed)
      onRefresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setEditedConfig(JSON.stringify(config, null, 2))
    setError(null)
  }

  return (
    <div className="space-y-6">
      {/* Visual step flow */}
      <div className="flex items-center gap-2 flex-wrap">
        {steps.map((step, i) => (
          <div key={step.name} className="flex items-center gap-2">
            <div
              className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                step.enabled
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-gray-50 border-gray-200 text-gray-400'
              }`}
            >
              <div className="text-xs text-gray-400 mb-0.5">Step {step.order}</div>
              <div className="capitalize">{step.name.replace(/_/g, ' ')}</div>
              {step.required && <div className="text-xs text-blue-400">required</div>}
              {!step.enabled && <div className="text-xs text-gray-400">disabled</div>}
            </div>
            {i < steps.length - 1 && <span className="text-gray-300">-&gt;</span>}
          </div>
        ))}
      </div>

      {/* Config editor */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Pipeline Configuration (JSON)</h3>
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
            >
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <textarea
          className="w-full h-96 font-mono text-xs p-4 border border-gray-200 rounded-lg bg-gray-950 text-green-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={editedConfig}
          onChange={(e) => setEditedConfig(e.target.value)}
          spellCheck={false}
        />
      </div>

      {/* Step cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {steps.map((step) => (
          <div key={step.name} className="border border-gray-200 rounded-lg p-4 bg-white">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-medium text-gray-800 capitalize">{step.name.replace(/_/g, ' ')}</h4>
                <p className="text-xs text-gray-500 mt-1">{step.description}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0 ml-3">
                <span className="text-xs text-gray-400 font-mono">v{step.version}</span>
                {step.required && (
                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">required</span>
                )}
                <span
                  className={`px-1.5 py-0.5 text-xs rounded ${
                    step.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {step.enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
