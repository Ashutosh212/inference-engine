import { useEffect, useState } from 'react'
import { Plus, Copy, Check } from 'lucide-react'
import { getApiKeys, createApiKey } from '../api/client'
import ApiKeyTable from '../components/ApiKeyTable'

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

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRateLimit, setNewRateLimit] = useState(60)
  const [newIsAdmin, setNewIsAdmin] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getApiKeys()
      if (res.data) setKeys(res.data as ApiKey[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await createApiKey(newName, newRateLimit, newIsAdmin)
      if (res.data) {
        const d = res.data as ApiKey & { full_key: string }
        setCreatedKey(d.full_key)
        load()
      }
    } finally {
      setCreating(false)
    }
  }

  const copy = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setCreatedKey(null)
    setNewName('')
    setNewRateLimit(60)
    setNewIsAdmin(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{keys.length} key{keys.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} />
          Create New Key
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        {loading ? (
          <div className="text-sm text-gray-400">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="text-sm text-gray-400">No API keys yet.</div>
        ) : (
          <ApiKeyTable keys={keys} onRefresh={load} />
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            {createdKey ? (
              <>
                <h2 className="text-base font-semibold text-gray-800 mb-3">Key Created</h2>
                <p className="text-sm text-gray-500 mb-3">Save this key -- it won't be shown again.</p>
                <div className="flex items-center gap-2 p-3 bg-gray-950 rounded-lg">
                  <code className="flex-1 text-green-400 text-xs font-mono break-all">{createdKey}</code>
                  <button onClick={copy} className="text-gray-400 hover:text-white flex-shrink-0">
                    {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                  </button>
                </div>
                <button onClick={closeModal} className="mt-4 w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                  Done
                </button>
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold text-gray-800 mb-4">Create API Key</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Name</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. production-key"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Rate limit (req/min)</label>
                    <input
                      type="number"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={newRateLimit}
                      onChange={(e) => setNewRateLimit(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="is_admin" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} />
                    <label htmlFor="is_admin" className="text-sm text-gray-600">Admin key</label>
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={closeModal} className="flex-1 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    onClick={create}
                    disabled={!newName.trim() || creating}
                    className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
