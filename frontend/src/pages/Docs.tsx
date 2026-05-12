export default function Docs() {
  return (
    <div className="max-w-3xl space-y-8">
      <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Quick Start</h2>
        <p className="text-sm text-gray-600 mb-4">
          All API requests require an <code className="bg-gray-100 px-1 rounded font-mono text-xs">X-API-Key</code> header.
          Your admin key was printed to the backend console on first start.
        </p>

        <CodeBlock title="Set your API key in browser localStorage" lang="js" code={`localStorage.setItem('inference_api_key', 'sk-your-key-here')`} />
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4">POST /v1/predict -- Synchronous Inference</h2>
        <p className="text-sm text-gray-600 mb-4">Upload an image and receive predictions immediately.</p>

        <CodeBlock title="Python" lang="python" code={`import requests

API_KEY = "sk-your-key-here"
API_URL = "http://localhost:8000"

with open("image.jpg", "rb") as f:
    response = requests.post(
        f"{API_URL}/v1/predict",
        headers={"X-API-Key": API_KEY},
        files={"file": ("image.jpg", f, "image/jpeg")},
    )

result = response.json()
print(result["data"]["predictions"])`} />

        <CodeBlock title="JavaScript / Fetch" lang="js" code={`const form = new FormData();
form.append('file', imageFile);

const response = await fetch('/v1/predict', {
  method: 'POST',
  headers: { 'X-API-Key': 'sk-your-key-here' },
  body: form,
});
const result = await response.json();
console.log(result.data.predictions);`} />

        <CodeBlock title="cURL" lang="bash" code={`curl -X POST http://localhost:8000/v1/predict \\
  -H "X-API-Key: sk-your-key-here" \\
  -F "file=@image.jpg"`} />
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4">POST /v1/predict/async -- Async Inference</h2>
        <CodeBlock title="Python" lang="python" code={`import requests, time

# Queue job
resp = requests.post(
    "http://localhost:8000/v1/predict/async",
    headers={"X-API-Key": API_KEY},
    files={"file": open("image.jpg", "rb")},
)
job_id = resp.json()["data"]["job_id"]

# Poll
while True:
    job = requests.get(
        f"http://localhost:8000/v1/jobs/{job_id}",
        headers={"X-API-Key": API_KEY},
    ).json()["data"]
    if job["status"] in ("completed", "failed"):
        break
    time.sleep(2)

print(job["predictions"])`} />
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Pipeline Overrides</h2>
        <p className="text-sm text-gray-600 mb-4">
          Override any pipeline parameter for a single request using the <code className="bg-gray-100 px-1 rounded font-mono text-xs">parameters</code> field.
        </p>
        <CodeBlock title="Python -- custom resize and patch size" lang="python" code={`import json

resp = requests.post(
    "http://localhost:8000/v1/predict",
    headers={"X-API-Key": API_KEY},
    files={"file": open("image.jpg", "rb")},
    data={
        "parameters": json.dumps({
            "resize": {"target_width": 384, "target_height": 384},
            "patch": {"patch_size": 32},
        })
    },
)`} />
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4">API Reference</h2>
        <div className="space-y-3 text-sm">
          <EndpointRow method="POST" path="/v1/predict" desc="Synchronous inference" />
          <EndpointRow method="POST" path="/v1/predict/async" desc="Queue async inference job" />
          <EndpointRow method="GET" path="/v1/jobs/{id}" desc="Poll async job status" />
          <EndpointRow method="GET" path="/v1/pipeline" desc="Get pipeline config" />
          <EndpointRow method="PATCH" path="/v1/pipeline" desc="Update pipeline config (admin)" />
          <EndpointRow method="GET" path="/v1/models" desc="List available models" />
          <EndpointRow method="GET" path="/v1/api-keys" desc="List API keys (admin)" />
          <EndpointRow method="POST" path="/v1/api-keys" desc="Create API key (admin)" />
          <EndpointRow method="DELETE" path="/v1/api-keys/{id}" desc="Revoke API key (admin)" />
          <EndpointRow method="GET" path="/v1/stats" desc="Dashboard statistics" />
          <EndpointRow method="GET" path="/v1/logs" desc="Request logs" />
          <EndpointRow method="GET" path="/health" desc="Health check" />
        </div>
        <button
          onClick={() => window.open('http://localhost:8000/docs', '_blank')}
          className="mt-4 inline-block text-sm text-blue-600 hover:underline"
        >
          Open Swagger UI &rarr;
        </button>
      </section>
    </div>
  )
}

function CodeBlock({ title, lang, code }: { title: string; lang: string; code: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between bg-gray-800 text-gray-300 text-xs px-4 py-2 rounded-t-lg">
        <span>{title}</span>
        <span className="opacity-50">{lang}</span>
      </div>
      <pre className="bg-gray-950 text-green-400 text-xs p-4 rounded-b-lg overflow-x-auto font-mono">{code}</pre>
    </div>
  )
}

function EndpointRow({ method, path, desc }: { method: string; path: string; desc: string }) {
  const color =
    method === 'GET'
      ? 'text-green-600 bg-green-50'
      : method === 'POST'
      ? 'text-blue-600 bg-blue-50'
      : method === 'PATCH'
      ? 'text-yellow-600 bg-yellow-50'
      : 'text-red-600 bg-red-50'
  return (
    <div className="flex items-center gap-3">
      <span className={`px-2 py-0.5 rounded font-mono text-xs font-medium ${color}`}>{method}</span>
      <code className="text-gray-700 font-mono text-xs">{path}</code>
      <span className="text-gray-400">{desc}</span>
    </div>
  )
}
