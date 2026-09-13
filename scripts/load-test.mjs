const base = process.env.API_URL || 'http://localhost:4000';
const concurrency = Math.max(1, Number(process.env.CONCURRENCY || 20));
const requests = Math.max(concurrency, Number(process.env.REQUESTS || 200));
const path = process.env.PATH_TO_TEST || '/health/ready';
let next = 0, ok = 0, failed = 0;
const started = Date.now();
async function worker() {
  while (true) {
    const i = next++;
    if (i >= requests) return;
    try { const r = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10000) }); if (r.ok) ok++; else failed++; }
    catch { failed++; }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker));
const elapsed = Date.now() - started;
console.log(JSON.stringify({ base, path, requests, concurrency, ok, failed, elapsedMs: elapsed, rps: Number((requests / (elapsed / 1000)).toFixed(2)) }));
if (failed) process.exitCode = 1;
