import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Log {
  id: string
  endpoint: string
  method: string
  input_filename: string | null
  input_size_bytes: number | null
  input_format: string | null
  preprocessing_ms: number | null
  inference_ms: number | null
  status_code: number
  total_latency_ms: number | null
  created_at: string
  ip_address: string | null
  step_timings: string | null
  output_preview: string | null
}

interface Props {
  logs: Log[]
}

export default function LogsTable({ logs }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="pb-2 font-medium text-gray-500 w-4" />
            <th className="pb-2 font-medium text-gray-500">Time</th>
            <th className="pb-2 font-medium text-gray-500">File</th>
            <th className="pb-2 font-medium text-gray-500">Format</th>
            <th className="pb-2 font-medium text-gray-500">Preproc</th>
            <th className="pb-2 font-medium text-gray-500">Inference</th>
            <th className="pb-2 font-medium text-gray-500">Total</th>
            <th className="pb-2 font-medium text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {logs.map((log) => (
            <>
              <tr
                key={log.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
              >
                <td className="py-3 text-gray-400">
                  {expanded === log.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </td>
                <td className="py-3 text-gray-500 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleTimeString()}
                </td>
                <td className="py-3 text-gray-700 max-w-[120px] truncate">{log.input_filename ?? '--'}</td>
                <td className="py-3 text-gray-500 uppercase text-xs">{log.input_format ?? '--'}</td>
                <td className="py-3 text-gray-600 font-mono text-xs">{log.preprocessing_ms != null ? `${log.preprocessing_ms}ms` : '--'}</td>
                <td className="py-3 text-gray-600 font-mono text-xs">{log.inference_ms != null ? `${log.inference_ms}ms` : '--'}</td>
                <td className="py-3 text-gray-600 font-mono text-xs">{log.total_latency_ms != null ? `${log.total_latency_ms}ms` : '--'}</td>
                <td className="py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      log.status_code < 300
                        ? 'bg-green-100 text-green-700'
                        : log.status_code < 500
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {log.status_code}
                  </span>
                </td>
              </tr>
              {expanded === log.id && (
                <tr key={`${log.id}-detail`}>
                  <td colSpan={8} className="bg-gray-50 px-4 py-3 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                      <div>
                        <p className="font-medium text-gray-700 mb-1">Step Timings</p>
                        {log.step_timings ? (
                          <pre className="font-mono">{JSON.stringify(JSON.parse(log.step_timings), null, 2)}</pre>
                        ) : '--'}
                      </div>
                      <div>
                        <p className="font-medium text-gray-700 mb-1">Output Preview</p>
                        <p className="font-mono break-all">{log.output_preview ?? '--'}</p>
                        <p className="mt-2 text-gray-400">IP: {log.ip_address ?? '--'}</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
