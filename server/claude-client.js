// Thin HTTP client for the local claude-worker (POST /run-oneshot).
// Expects env:
//   WORKER_URL          (e.g. http://127.0.0.1:3457)
//   WORKER_AUTH_SECRET  (shared secret for X-Worker-Auth header)

const DEFAULT_TIMEOUT_MS = 300_000;

function getWorkerUrl(){
  return process.env.WORKER_URL || 'http://127.0.0.1:3457';
}
function getSecret(){
  return process.env.WORKER_AUTH_SECRET || '';
}
export function isConfigured(){
  return !!getSecret();
}

async function post(pathname, body, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(getWorkerUrl() + pathname, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Auth': getSecret()
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* leave null */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `worker ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function health(){
  const res = await fetch(getWorkerUrl() + '/health', {
    headers: { 'X-Worker-Auth': getSecret() }
  });
  if (!res.ok) throw new Error(`worker health ${res.status}`);
  return res.json();
}

export async function oneshot({
  prompt, systemPrompt, timeoutMs, permissionMode,
  cwd, allowedTools
}){
  if (!isConfigured()) throw new Error('claude worker not configured (WORKER_AUTH_SECRET missing)');
  const body = { prompt };
  if (systemPrompt) body.systemPrompt = systemPrompt;
  if (permissionMode) body.permissionMode = permissionMode;
  if (timeoutMs) body.timeoutMs = timeoutMs;
  if (cwd) body.cwd = cwd;
  if (allowedTools && allowedTools.length) body.allowedTools = allowedTools;
  const res = await post('/run-oneshot', body, { timeoutMs: (timeoutMs || DEFAULT_TIMEOUT_MS) + 5000 });
  if (!res || !res.ok) throw new Error((res && res.error) || 'worker returned no result');
  return {
    output: res.output || '',
    usage: res.usage || null,
    durationMs: res.durationMs || null,
    stopReason: res.stopReason || null
  };
}

// Streaming variant using POST /run-oneshot-stream (Server-Sent Events).
// onChunk(delta)       — called for each text delta
// onDone({ stopReason, durationMs, output })  — called when the stream completes
// onError(err: Error)  — called on transport/protocol/worker error
// Returns when the stream ends.
export async function oneshotStream({
  prompt, systemPrompt, timeoutMs, permissionMode,
  cwd, allowedTools
}, { onChunk, onDone, onError }){
  if (!isConfigured()) throw new Error('claude worker not configured (WORKER_AUTH_SECRET missing)');

  const body = { prompt };
  if (systemPrompt) body.systemPrompt = systemPrompt;
  if (permissionMode) body.permissionMode = permissionMode;
  if (timeoutMs) body.timeoutMs = timeoutMs;
  if (cwd) body.cwd = cwd;
  if (allowedTools && allowedTools.length) body.allowedTools = allowedTools;

  const controller = new AbortController();
  const overallTimer = setTimeout(
    () => controller.abort(),
    (timeoutMs || DEFAULT_TIMEOUT_MS) + 10_000
  );

  let res;
  try {
    res = await fetch(getWorkerUrl() + '/run-oneshot-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Auth': getSecret(),
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(overallTimer);
    if (onError) onError(err);
    return;
  }

  if (!res.ok) {
    clearTimeout(overallTimer);
    const text = await res.text().catch(() => '');
    let msg = 'worker ' + res.status;
    try { const j = JSON.parse(text); if (j && j.error) msg = j.error; } catch {}
    if (onError) onError(new Error(msg));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let accumulated = '';
  let done = false;

  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buf += decoder.decode(value, { stream: true });

      // Split on blank-line-terminated SSE frames.
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const parsed = parseSseFrame(frame);
        if (!parsed) continue;
        if (parsed.event === 'text') {
          const data = safeJson(parsed.data);
          if (data && typeof data.delta === 'string') {
            accumulated += data.delta;
            if (onChunk) onChunk(data.delta);
          }
        } else if (parsed.event === 'done') {
          const data = safeJson(parsed.data) || {};
          done = true;
          if (onDone) onDone({
            stopReason: data.stopReason || 'end_turn',
            durationMs: data.durationMs || null,
            output: accumulated
          });
          break;
        } else if (parsed.event === 'error') {
          const data = safeJson(parsed.data) || {};
          done = true;
          if (onError) onError(new Error(data.message || 'worker error'));
          break;
        }
      }
    }
  } catch (err) {
    if (onError) onError(err);
  } finally {
    clearTimeout(overallTimer);
    try { reader.releaseLock(); } catch {}
  }
}

function parseSseFrame(frame){
  const lines = frame.split('\n');
  let event = 'message';
  const dataParts = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataParts.push(line.slice(5).trimStart());
    // ignore id:, retry:, comments
  }
  if (dataParts.length === 0 && event === 'message') return null;
  return { event, data: dataParts.join('\n') };
}

function safeJson(s){
  try { return JSON.parse(s); } catch { return null; }
}
