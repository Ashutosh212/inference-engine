import { useEffect, useState } from 'react'
import { getPipeline } from '../api/client'
import PipelineConfigurator from '../components/PipelineConfigurator'

export default function Pipeline() {
  const [data, setData] = useState<{ steps: unknown[]; config: Record<string, unknown> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    getPipeline()
      .then((res) => {
        if (res.data) setData(res.data as typeof data)
        else setError(res.error?.message ?? 'Failed to load pipeline')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  if (loading) return <div className="text-sm text-gray-400">Loading pipeline...</div>
  if (error) return <div className="text-sm text-red-600">{error}</div>
  if (!data) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 mb-6">Preprocessing Pipeline</h2>
      <PipelineConfigurator
        steps={data.steps as Parameters<typeof PipelineConfigurator>[0]['steps']}
        config={data.config}
        onRefresh={load}
      />
    </div>
  )
}
