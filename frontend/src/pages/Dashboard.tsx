import { useEffect, useState } from 'react'
import { Activity, Clock, Zap, AlertTriangle, Key } from 'lucide-react'
import { getStats } from '../api/client'
import { RequestsChart, StepTimingsChart } from '../components/UsageChart'
import { formatMs } from '../lib/utils'

interface Stats {
  total_requests: number
  requests_today: number
  requests_this_week: number
  avg_latency_ms: number
  avg_preprocessing_ms: number
  avg_inference_ms: number
  p95_latency_ms: number
  error_rate: number
  requests_per_hour: { hour: string; count: number }[]
  top_api_keys: { id: string; name: string; prefix: string; total_requests: number }[]
  model_info: { name: string; version: string; status: string }
  pipeline_info: { name: string; order: number; enabled: boolean }[]
  avg_step_timings: Record<string, number>
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getStats()
      .then((res) => {
        if (res.data) setStats(res.data as Stats)
        else setError(res.error?.message ?? 'Failed to load stats')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
        {error}. Make sure your API key is set.
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard title="Total Requests" value={stats.total_requests.toLocaleString()} icon={<Activity size={18} className="text-blue-500" />} />
        <StatCard title="Avg Latency" value={formatMs(stats.avg_latency_ms)} icon={<Clock size={18} className="text-purple-500" />} />
        <StatCard title="Avg Preproc" value={formatMs(stats.avg_preprocessing_ms)} icon={<Zap size={18} className="text-yellow-500" />} />
        <StatCard title="Error Rate" value={`${stats.error_rate.toFixed(1)}%`} icon={<AlertTriangle size={18} className="text-red-500" />} />
        <StatCard title="Requests Today" value={stats.requests_today.toLocaleString()} icon={<Key size={18} className="text-green-500" />} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Requests (last 24h)</h3>
          {stats.requests_per_hour.length > 0 ? (
            <RequestsChart data={stats.requests_per_hour} />
          ) : (
            <EmptyChart />
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Avg Step Timings</h3>
          {Object.keys(stats.avg_step_timings).length > 0 ? (
            <StepTimingsChart data={stats.avg_step_timings} />
          ) : (
            <EmptyChart />
          )}
        </div>
      </div>

      {/* Model info + pipeline summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Model</h3>
          <div className="space-y-2 text-sm">
            <Row label="Name" value={stats.model_info.name} />
            <Row label="Version" value={stats.model_info.version} />
            <Row label="Status" value={stats.model_info.status} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top API Keys</h3>
          {stats.top_api_keys.length === 0 ? (
            <p className="text-sm text-gray-400">No requests yet</p>
          ) : (
            <div className="space-y-2">
              {stats.top_api_keys.map((k) => (
                <div key={k.id} className="flex justify-between text-sm">
                  <span className="text-gray-700">{k.name}</span>
                  <span className="text-gray-400 font-mono">{k.total_requests.toLocaleString()} reqs</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-gray-500">{title}</span></div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-700">{value}</span>
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="h-48 flex items-center justify-center text-gray-300 text-sm">No data yet</div>
  )
}
