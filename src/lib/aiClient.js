// Calls the Netlify function (/api/ask) and streams the reply text.
// Set VITE_AI_ENDPOINT to point a Capacitor build at your deployed site.
const ENDPOINT = import.meta.env.VITE_AI_ENDPOINT ?? '/api/ask';

export async function streamAI(payload, onText, { signal } = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  // A static host without the function answers with the SPA's index.html — treat as unavailable.
  if (res.ok && !(res.headers.get('content-type') ?? '').startsWith('text/plain')) {
    const err = new Error('AI endpoint not available');
    err.status = 404;
    throw err;
  }
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => '');
    const err = new Error(msg || `AI request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    onText(text);
  }
  return text;
}
