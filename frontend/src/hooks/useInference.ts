import { useState, useCallback } from 'react'
import { predict, predictAsync, getJob } from '../api/client'

export interface OBBPrediction {
  cx: number
  cy: number
  width: number
  height: number
  angle: number
  confidence: number
  class_id: number
  class_name: string
  tile_offset: [number, number]
}

export interface InferenceResult {
  request_id?: string
  job_id?: string
  status: string
  predictions?: {
    predictions: OBBPrediction[]
    num_detections: number
    num_tiles: number
    image_size: [number, number]
    model: string
    version: string
    conf_threshold: number
  }
  preprocessing?: {
    steps_completed: string[]
    step_timings: Record<string, number>
    step_outputs: Record<string, Record<string, unknown>>
    total_preprocessing_ms: number
    errors: { step: string; error: string }[]
  }
  inference_ms?: number
  total_latency_ms?: number
  save_dir?: string
  created_at?: string
  error?: string
}

export function useInference() {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InferenceResult | null>(null)

  const run = useCallback(async (file: File, async_mode = false, parameters?: Record<string, unknown>) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      if (async_mode) {
        setProgress('Queuing job...')
        const queueRes = await predictAsync(file, parameters)
        if (!queueRes.data) throw new Error(queueRes.error?.message || 'Failed to queue job')

        const { job_id } = queueRes.data as { job_id: string; poll_url: string }
        setProgress('Processing...')

        let attempts = 0
        while (attempts < 60) {
          await new Promise((r) => setTimeout(r, 2000))
          const jobRes = await getJob(job_id)
          const job = jobRes.data as InferenceResult & { status: string }
          if (job.status === 'completed' || job.status === 'failed') {
            setResult({ ...job, job_id })
            break
          }
          attempts++
          setProgress(`Processing... (${attempts * 2}s)`)
        }
      } else {
        setProgress('Preprocessing...')
        setTimeout(() => setProgress('Running model...'), 400)
        const res = await predict(file, parameters)
        if (!res.data) throw new Error(res.error?.message || 'Inference failed')
        setResult(res.data as InferenceResult)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setLoading(false)
      setProgress('')
    }
  }, [])

  return { run, loading, progress, error, result }
}
