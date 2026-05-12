import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getLogs } from '../api/client'
import LogsTable from '../components/LogsTable'

interface LogsData {
  logs: unknown[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export default function Logs() {
  const [data, setData] = useState<LogsData | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = (p: number) => {
    setLoading(true)
    getLogs({ page: p, page_size: 25 })
      .then((res) => {
        if (res.data) setData(res.data as LogsData)
        else setError(res.error?.message ?? 'Failed to load logs')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(page) }, [page])

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Request Logs</h2>
          {data && (
            <span className="text-xs text-gray-400">{data.total} total</span>
          )}
        </div>

        {loading ? (
          <div className="text-sm text-gray-400">Loading...</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : data && data.logs.length > 0 ? (
          <>
            <LogsTable logs={data.logs as Parameters<typeof LogsTable>[0]['logs']} />
            {data.total_pages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-gray-500">
                  Page {page} of {data.total_pages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                  disabled={page === data.total_pages}
                  className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-gray-400">No logs yet. Run some inference requests to see them here.</div>
        )}
      </div>
    </div>
  )
}
