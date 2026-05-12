import { useState } from 'react'
import { Trash2, Edit2, Check, X } from 'lucide-react'
import { updateApiKey, revokeApiKey } from '../api/client'

interface ApiKey {
  id: string
  key_prefix: string
  name: string
  created_at: string
  last_used_at: string | null
  is_active: boolean
  is_admin: boolean
  rate_limit: number
  total_requests: number
}

interface Props {
  keys: ApiKey[]
  onRefresh: () => void
}

export default function ApiKeyTable({ keys, onRefresh }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRateLimit, setEditRateLimit] = useState(60)

  const startEdit = (key: ApiKey) => {
    setEditingId(key.id)
    setEditName(key.name)
    setEditRateLimit(key.rate_limit)
  }

  const saveEdit = async (id: string) => {
    await updateApiKey(id, { name: editName, rate_limit: editRateLimit })
    setEditingId(null)
    onRefresh()
  }

  const revoke = async (id: string) => {
    if (!window.confirm('Revoke this API key? This cannot be undone.')) return
    await revokeApiKey(id)
    onRefresh()
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="pb-2 font-medium text-gray-500">Key</th>
            <th className="pb-2 font-medium text-gray-500">Name</th>
            <th className="pb-2 font-medium text-gray-500">Rate Limit</th>
            <th className="pb-2 font-medium text-gray-500">Status</th>
            <th className="pb-2 font-medium text-gray-500">Requests</th>
            <th className="pb-2 font-medium text-gray-500">Last Used</th>
            <th className="pb-2 font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {keys.map((key) => (
            <tr key={key.id} className="hover:bg-gray-50">
              <td className="py-3 font-mono text-xs text-gray-600">
                {key.key_prefix}
                <span className="opacity-60">••••••••</span>
                {key.is_admin && (
                  <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">admin</span>
                )}
              </td>
              <td className="py-3">
                {editingId === key.id ? (
                  <input
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                ) : (
                  key.name
                )}
              </td>
              <td className="py-3">
                {editingId === key.id ? (
                  <input
                    type="number"
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
                    value={editRateLimit}
                    onChange={(e) => setEditRateLimit(Number(e.target.value))}
                  />
                ) : (
                  `${key.rate_limit}/min`
                )}
              </td>
              <td className="py-3">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    key.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {key.is_active ? 'Active' : 'Revoked'}
                </span>
              </td>
              <td className="py-3 text-gray-600">{key.total_requests.toLocaleString()}</td>
              <td className="py-3 text-gray-400 text-xs">
                {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : '--'}
              </td>
              <td className="py-3">
                <div className="flex items-center gap-2">
                  {editingId === key.id ? (
                    <>
                      <button onClick={() => saveEdit(key.id)} className="text-green-600 hover:text-green-700">
                        <Check size={15} />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(key)} className="text-gray-400 hover:text-blue-500">
                        <Edit2 size={15} />
                      </button>
                      {key.is_active && (
                        <button onClick={() => revoke(key.id)} className="text-gray-400 hover:text-red-500">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
