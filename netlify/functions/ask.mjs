import Anthropic from '@anthropic-ai/sdk';

// POST /api/ask — AI assistant for Drive.
//   { mode: "ask",   question, table, today }            → answers questions about the trip table
//   { mode: "draft", facts, transcript, notes, typeLabel } → first draft of an incident statement
// Streams plain text back. Needs ANTHROPIC_API_KEY in Netlify → Site settings → Environment variables.

const client = new Anthropic();
const MODEL = 'claude-opus-5';
const MAX_TABLE = 250_000; // characters (~6 months of trips)

const ASK_SYSTEM = `You are the assistant inside "Drive", a car-tracker app used in India.
You answer the owner's questions using only the trip table they provide (CSV, one row per trip).
Columns: date, dow, start, end (local 24h time), from, to (saved place names; "Roadside"/"Unknown" if none), driver, km, minutes, max_kmh, fuel_inr, toll_inr, parking_inr, score (0-100 safety), events (type:count).
Rules:
- Compute answers from the rows; show the key numbers (₹ with Indian digit grouping, km, times like 8:40 AM).
- Total cost = fuel_inr + toll_inr + parking_inr unless the user asks for one part.
- "Weekend" = Sat and Sun. Resolve relative dates against the "today" date given in the question.
- If the table can't answer it, say what's missing in one sentence. Never invent trips.
- Reply in 1-4 short sentences, plain text, no markdown tables. Answer in the language the user wrote in.`;

const DRAFT_SYSTEM = `You help a driver in India write the first draft of an incident statement for their motor insurance claim.
Write in the first person, past tense, plain factual language, 120-220 words.
Use only the facts provided (sealed tracker data, the cabin-audio transcript, and the driver's notes). Do not guess fault, injuries, or details that aren't given — where something important is missing, insert a bracketed prompt like [describe what the other vehicle did].
Include time, place, speed from the tracker, and what happened in order. No headings, no markdown.`;

function sameOrigin(req) {
  const allowed = [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL].filter(Boolean);
  const origin = req.headers.get('origin') ?? '';
  // Capacitor apps send capacitor://localhost or https://localhost.
  return !allowed.length || allowed.includes(origin) || /^(capacitor|https?):\/\/localhost(:\d+)?$/.test(origin);
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return new Response('AI is not configured on this site (ANTHROPIC_API_KEY missing).', { status: 503 });

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  let params;
  if (body.mode === 'draft') {
    const facts = JSON.stringify(body.facts ?? {}, null, 2).slice(0, 20_000);
    params = {
      system: DRAFT_SYSTEM,
      messages: [{
        role: 'user',
        content: `Incident type: ${String(body.typeLabel ?? '').slice(0, 80)}\n\nSealed tracker facts:\n${facts}\n\nCabin audio transcript (may be empty):\n${String(body.transcript ?? '').slice(0, 8_000)}\n\nDriver's notes so far (may be empty):\n${String(body.notes ?? '').slice(0, 8_000)}\n\nWrite the statement draft now.`,
      }],
      output_config: { effort: 'medium' },
    };
  } else {
    const question = String(body.question ?? '').trim().slice(0, 500);
    const table = String(body.table ?? '');
    if (!question) return new Response('Ask a question', { status: 400 });
    if (table.length > MAX_TABLE) return new Response('Too much data for one question', { status: 413 });
    params = {
      system: ASK_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          // The table is identical across questions in a session, so cache it.
          { type: 'text', text: `Trip table:\n${table}`, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: `Today is ${String(body.today ?? '').slice(0, 40)}.\nQuestion: ${question}` },
        ],
      }],
      // Short factual Q&A: low effort keeps answers fast.
      output_config: { effort: 'low' },
    };
  }

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    // If a safety classifier declines, the API retries on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    ...params,
  });

  const enc = new TextEncoder();
  const out = new ReadableStream({
    async start(controller) {
      stream.on('text', (delta) => controller.enqueue(enc.encode(delta)));
      try {
        const msg = await stream.finalMessage();
        if (msg.stop_reason === 'refusal') controller.enqueue(enc.encode('\n\nThe assistant couldn’t help with that request.'));
        if (msg.stop_reason === 'max_tokens') controller.enqueue(enc.encode('…'));
      } catch (err) {
        const status = err instanceof Anthropic.APIError ? err.status : null;
        const text = status === 429 ? 'The assistant is busy — try again in a moment.'
          : status === 401 ? 'The site’s Anthropic API key is invalid.'
            : 'The assistant is unavailable right now.';
        controller.enqueue(enc.encode(`\n\n${text}`));
      }
      controller.close();
    },
  });

  return new Response(out, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
};

