import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Sparkles, Smartphone } from 'lucide-react';
import { useApp } from '../state.jsx';
import { NavBar } from '../components/ui.jsx';
import { answerLocally, tripTable } from '../lib/ask.js';
import { streamAI } from '../lib/aiClient.js';

const SUGGESTIONS = [
  'How much did weekend trips cost in September?',
  'When do I usually leave office?',
  'Where do I brake hard most often?',
  'How many km did Rohan drive this month?',
  'What was my top speed last week?',
  'Which day of the week do I spend the most on fuel?',
];

export default function Ask({ pop, question: initial }) {
  const { trips, placeNameAt, savedPlaces, settings, drivers, network } = useApp();
  const [msgs, setMsgs] = useState([{ role: 'ai', text: 'Ask me anything about your driving — costs, times, places, habits. I use your trip history from the tracker.', src: null }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef();
  const ctx = useMemo(() => ({ trips, nameAt: placeNameAt, places: savedPlaces, fuel: settings.fuel, parkingFees: settings.parkingFees, drivers, now: Date.now() }), [trips, placeNameAt, savedPlaces, settings.fuel, settings.parkingFees, drivers]);
  const table = useMemo(() => tripTable(trips, ctx), [trips, ctx]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs]);

  const ask = async (q) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput('');
    setBusy(true);
    setMsgs((m) => [...m, { role: 'me', text: question }, { role: 'ai', text: '', src: 'pending' }]);
    const update = (text, src) => setMsgs((m) => [...m.slice(0, -1), { role: 'ai', text, src }]);
    const local = answerLocally(question, ctx);

    if (!network.phoneOnline) {
      update(local.confident ? local.answer : `${local.answer}`, 'phone');
    } else {
      try {
        await streamAI({ mode: 'ask', question, table, today: new Date().toDateString() }, (t) => update(t, 'ai'));
      } catch {
        // Not deployed with an API key, or the network failed: answer on the phone instead.
        update(local.answer, 'phone');
      }
    }
    setBusy(false);
  };

  useEffect(() => { if (initial) ask(initial); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen pushed" style={{ paddingBottom: 'calc(var(--safe-bottom) + 90px)' }}>
      <NavBar title="Ask about your driving" onBack={pop} />
      <div className="chat">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.text || (m.src === 'pending' ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '')}
            {m.role === 'ai' && m.src && m.src !== 'pending' && (
              <span className="src">{m.src === 'ai' ? <><Sparkles size={10} style={{ display: 'inline', verticalAlign: -1 }} /> Claude · from your trip data</> : <><Smartphone size={10} style={{ display: 'inline', verticalAlign: -1 }} /> Answered on this phone{network.phoneOnline ? '' : ' (offline)'}</>}</span>
            )}
          </div>
        ))}
        {msgs.length === 1 && (
          <div className="stack" style={{ gap: 8, marginTop: 6 }}>
            {SUGGESTIONS.map((s) => <button key={s} className="chip" style={{ justifySelf: 'start', height: 'auto', padding: '8px 12px', textAlign: 'left' }} onClick={() => ask(s)}>{s}</button>)}
          </div>
        )}
        <div ref={endRef} />
      </div>
      {createPortal(<form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input id="ask-input" value={input} placeholder={network.phoneOnline ? 'Ask a question…' : 'Offline — basic answers only'} onChange={(e) => setInput(e.target.value)} autoComplete="off" />
        <button className="icon-btn" type="submit" style={{ width: 44, height: 44, background: 'var(--accent)', color: '#fff' }} aria-label="Send" disabled={busy || !input.trim()}><ArrowUp size={20} /></button>
      </form>, document.querySelector('.app') ?? document.body)}
    </div>
  );
}
