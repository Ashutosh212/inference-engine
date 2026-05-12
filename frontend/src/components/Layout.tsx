import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Play, BarChart2, GitBranch, Key, FileText, BookOpen, Menu, X, Cpu, Circle, Settings } from 'lucide-react'
import { cn } from '../lib/utils'
import { getHealth } from '../api/client'

const NAV_ITEMS = [
  { to: '/playground', label: 'Playground', icon: Play },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart2 },
  { to: '/pipeline', label: 'Pipeline', icon: GitBranch },
  { to: '/api-keys', label: 'API Keys', icon: Key },
  { to: '/logs', label: 'Logs', icon: FileText },
  { to: '/docs', label: 'Docs', icon: BookOpen },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [modelLoaded, setModelLoaded] = useState<boolean | null>(null)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('inference_api_key') || '')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')

  const hasKey = apiKey.length > 0

  useEffect(() => {
    if (!hasKey) return
    getHealth()
      .then((res) => {
        const d = res.data as { model_loaded: boolean } | null
        setModelLoaded(d?.model_loaded ?? false)
      })
      .catch(() => setModelLoaded(false))
  }, [hasKey])

  const saveKey = () => {
    const trimmed = keyDraft.trim()
    if (!trimmed) return
    localStorage.setItem('inference_api_key', trimmed)
    setApiKey(trimmed)
    setShowKeyInput(false)
    setKeyDraft('')
    window.location.reload()
  }

  const clearKey = () => {
    localStorage.removeItem('inference_api_key')
    setApiKey('')
    setShowKeyInput(true)
    setKeyDraft('')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className={cn('flex flex-col bg-slate-900 text-white transition-all duration-200', sidebarOpen ? 'w-56' : 'w-14')}>
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700">
          <Cpu size={22} className="text-blue-400 flex-shrink-0" />
          {sidebarOpen && <span className="font-semibold text-sm tracking-wide truncate">InferenceEngine</span>}
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to))
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                )}
              >
                <Icon size={18} className="flex-shrink-0" />
                {sidebarOpen && <span>{label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* API key display at bottom of sidebar */}
        <div className="border-t border-slate-700 px-3 py-3 space-y-2">
          {hasKey ? (
            <div className={cn('flex items-center gap-2', !sidebarOpen && 'justify-center')}>
              <Key size={14} className="text-green-400 flex-shrink-0" />
              {sidebarOpen && (
                <>
                  <span className="text-xs text-slate-400 font-mono truncate flex-1">{apiKey.slice(0, 12)}…</span>
                  <button onClick={clearKey} className="text-slate-500 hover:text-red-400 flex-shrink-0" title="Change key">
                    <Settings size={13} />
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={cn('flex items-center gap-2', !sidebarOpen && 'justify-center')}>
              <Key size={14} className="text-red-400 flex-shrink-0" />
              {sidebarOpen && <span className="text-xs text-red-400">No API key set</span>}
            </div>
          )}
        </div>

        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-4 text-slate-400 hover:text-white border-t border-slate-700">
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-800">
            {NAV_ITEMS.find((n) => location.pathname.startsWith(n.to))?.label ?? 'InferenceEngine'}
          </h1>
          <div className="flex items-center gap-4">
            {/* Model status */}
            {hasKey && (
              <div className="flex items-center gap-2 text-sm">
                <Circle size={10} className={cn('fill-current', modelLoaded === null ? 'text-yellow-400' : modelLoaded ? 'text-green-400' : 'text-red-400')} />
                <span className="text-gray-500">{modelLoaded === null ? 'Checking...' : modelLoaded ? 'Model loaded' : 'Model offline'}</span>
              </div>
            )}
            {/* Key button in topbar */}
            <button
              onClick={() => { setKeyDraft(apiKey); setShowKeyInput(true) }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                hasKey
                  ? 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  : 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100'
              )}
            >
              <Key size={13} />
              {hasKey ? `${apiKey.slice(0, 10)}…` : 'Set API Key'}
            </button>
          </div>
        </header>

        {/* No-key banner */}
        {!hasKey && !showKeyInput && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between">
            <span className="text-sm text-amber-700">No API key set — requests will fail with 401.</span>
            <button onClick={() => setShowKeyInput(true)} className="text-sm font-medium text-amber-700 underline">
              Set key
            </button>
          </div>
        )}

        {/* Key input modal */}
        {showKeyInput && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
              <h2 className="text-base font-semibold text-gray-800 mb-1">API Key</h2>
              <p className="text-sm text-gray-500 mb-4">
                Paste your admin key. Find it in the backend terminal output, or generate one with the script in the Docs page.
              </p>
              <input
                autoFocus
                type="text"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="sk-..."
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveKey()}
              />
              <div className="flex gap-2 mt-4">
                {hasKey && (
                  <button onClick={() => setShowKeyInput(false)} className="flex-1 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                )}
                <button
                  onClick={saveKey}
                  disabled={!keyDraft.trim()}
                  className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40"
                >
                  Save & Reload
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
