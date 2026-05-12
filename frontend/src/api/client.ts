import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || ''

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 600000,  // 10 min — CPU inference on large images is slow
})

apiClient.interceptors.request.use((config) => {
  const key = localStorage.getItem('inference_api_key')
  if (key) {
    config.headers['X-API-Key'] = key
  }
  return config
})

export interface ApiResponse<T = unknown> {
  data: T | null
  error: { code: string; message: string } | null
}

export async function getHealth() {
  const res = await apiClient.get<ApiResponse>('/health')
  return res.data
}

export async function predict(file: File, parameters?: Record<string, unknown>) {
  const form = new FormData()
  form.append('file', file)
  if (parameters) {
    form.append('parameters', JSON.stringify(parameters))
  }
  const res = await apiClient.post<ApiResponse>('/v1/predict', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function predictAsync(file: File, parameters?: Record<string, unknown>) {
  const form = new FormData()
  form.append('file', file)
  if (parameters) {
    form.append('parameters', JSON.stringify(parameters))
  }
  const res = await apiClient.post<ApiResponse>('/v1/predict/async', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function getJob(jobId: string) {
  const res = await apiClient.get<ApiResponse>(`/v1/jobs/${jobId}`)
  return res.data
}

export async function getPipeline() {
  const res = await apiClient.get<ApiResponse>('/v1/pipeline')
  return res.data
}

export async function updatePipeline(config: Record<string, unknown>) {
  const res = await apiClient.patch<ApiResponse>('/v1/pipeline', config)
  return res.data
}

export async function getStats() {
  const res = await apiClient.get<ApiResponse>('/v1/stats')
  return res.data
}

export async function getLogs(params?: { page?: number; page_size?: number; status_code?: number; api_key_id?: string }) {
  const res = await apiClient.get<ApiResponse>('/v1/logs', { params })
  return res.data
}

export async function getApiKeys() {
  const res = await apiClient.get<ApiResponse>('/v1/api-keys')
  return res.data
}

export async function createApiKey(name: string, rate_limit = 60, is_admin = false) {
  const res = await apiClient.post<ApiResponse>('/v1/api-keys', { name, rate_limit, is_admin })
  return res.data
}

export async function revokeApiKey(id: string) {
  const res = await apiClient.delete<ApiResponse>(`/v1/api-keys/${id}`)
  return res.data
}

export async function updateApiKey(id: string, body: { name?: string; rate_limit?: number; is_active?: boolean }) {
  const res = await apiClient.patch<ApiResponse>(`/v1/api-keys/${id}`, body)
  return res.data
}
