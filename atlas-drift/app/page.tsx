'use client';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, Copy, LoaderCircle, MapPin, RotateCcw, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import WorldMap from './world-map';
import CountrySearch from './country-search';
import countries from '@/lib/countries.json';
import { TIERS, type PublicGame, type Result } from '@/lib/game';

type Options = { borders: boolean; names: boolean; timed: boolean };
type Stage = 'play' | 'reveal' | 'results';
type Mode = 'daily' | 'practice' | 'ai';
type Saved = { game: PublicGame; stage: Stage; selected: string | null; point: { x: number; y: number } | null; deadline: number | null; options: Options };
type History = { id: string; score: number; correct: number; date: string; mode: string };
type Modal = 'help' | 'settings' | 'connect' | 'stats';

const defaults: Options = { borders: true, names: true, timed: false };
const ROUND_SECONDS = 60;
const MODES: Record<Mode, { label: string; note: string }> = {
  daily: { label: 'Daily trail', note: 'The same five prompts for everyone today. One attempt.' },
  practice: { label: 'Practice', note: 'Shuffled from the handwritten bank. Play as often as you like.' },
  ai: { label: 'Purdue AI', note: 'Five brand-new prompts for every game. Takes up to two minutes.' },
};
const MODE_NAMES: Record<string, string> = { daily: 'Daily trail', practice: 'Practice', ai: 'Purdue AI' };

const countryName = (code: string | null) => countries.find(c => c.code === code)?.name || 'No pin';
const tierOf = (points: number) => TIERS.findIndex(t => t.points === points);
const km = (n: number) => n.toLocaleString('en-US');
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function read<T,>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; } }
function write(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ } }
async function post<T,>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<'home' | 'game'>('home');
  const [stage, setStage] = useState<Stage>('play');
  const [game, setGame] = useState<PublicGame | null>(null);
  const [options, setOptions] = useState<Options>(defaults);
  const [gameOptions, setGameOptions] = useState<Options>(defaults);
  const [selected, setSelected] = useState<string | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null);
  const [mode, setMode] = useState<Mode>('daily');
  const [status, setStatus] = useState<{ connected: boolean; model: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<History[]>([]);
  const [copied, setCopied] = useState(false);
  const [review, setReview] = useState<number | null>(null);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  /* Browser storage is only readable after mount; hydrating it here avoids a server/client mismatch. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setOptions(read('atlas:options', defaults));
    setHistory(read('atlas:history', []));
    setMode(read<Mode>('atlas:mode', 'daily'));
    const s = read<Saved | null>('atlas:current', null);
    if (s?.game?.token && s.game.questions?.length === 5 && ['play', 'reveal', 'results'].includes(s.stage)) {
      setGame(s.game); setStage(s.stage); setSelected(s.deadline && s.deadline < Date.now() ? null : s.selected);
      setPoint(s.point); setDeadline(s.deadline); setGameOptions(s.options || defaults);
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch('/api/status').then(r => r.json() as Promise<{ connected: boolean; model: string | null }>)
      .then(setStatus).catch(() => setStatus({ connected: false, model: null }));
  }, []);
  useEffect(() => { if (ready) write('atlas:options', options); }, [options, ready]);
  useEffect(() => { if (ready) write('atlas:mode', mode); }, [mode, ready]);
  useEffect(() => {
    if (!ready || !game) return;
    const s: Saved = { game, stage, selected, point, deadline, options: gameOptions };
    write('atlas:current', s);
    if (game.mode === 'daily') write(`atlas:daily:${game.id}`, s);
  }, [ready, game, stage, selected, point, deadline, gameOptions]);
  /* Today's finished daily score, if any. Re-read whenever the game moves on. */
  const dailyDone = useMemo(() => {
    if (!ready) return null;
    const id = `daily-${today()}`;
    /* The live game is fresher than storage, which is written after this render. */
    const s = game?.id === id ? { game, stage } : read<Saved | null>(`atlas:daily:${id}`, null);
    return s?.stage === 'results' ? s.game.results.reduce((t, r) => t + r.points, 0) : null;
  }, [ready, game, stage]);
  function record(g: PublicGame) {
    setHistory(old => {
      if (old.some(h => h.id === g.id)) return old;
      const next = [{ id: g.id, score: g.results.reduce((s, r) => s + r.points, 0), correct: g.results.filter(r => r.points > 0).length, date: today(), mode: g.mode }, ...old].slice(0, 200);
      write('atlas:history', next);
      return next;
    });
  }

  const round = game ? Math.min(4, stage === 'reveal' ? game.results.length - 1 : game.results.length) : 0;
  const question = game?.questions[round];
  const result = stage === 'reveal' ? game?.results[round] : null;
  const total = game?.results.reduce((s, r) => s + r.points, 0) || 0;
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : ROUND_SECONDS;
  const playing = screen === 'game' && !!game;
  const inProgress = !!game && stage !== 'results';

  const submit = useCallback(async (code: string | null) => {
    if (!game || stage !== 'play' || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const r = await post<{ token: string; result: Result }>('/api/answer', { token: game.token, country: code });
      setGame({ ...game, token: r.token, results: [...game.results, r.result] });
      setStage('reveal'); setDeadline(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your pin didn’t go through. Try again.');
      setDeadline(null);
    } finally { setBusy(false); submitting.current = false; }
  }, [game, stage]);
  const timeUp = useEffectEvent(() => submit(selected));

  useEffect(() => {
    if (!ready || stage !== 'play' || !game || !deadline) return;
    const tick = () => { const time = Date.now(); setNow(time); if (time >= deadline) timeUp(); };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [ready, stage, game, deadline]);

  /* Each screen and round starts at the top of the panel. */
  const panelKey = playing ? `${stage}-${round}` : 'home';
  useEffect(() => { document.getElementById('panel')?.scrollTo({ top: 0 }); }, [panelKey]);

  /* Move focus to the new prompt so keyboard and screen-reader users follow the round change. */
  useEffect(() => { if (playing && stage !== 'reveal') heading.current?.focus({ preventScroll: true }); }, [playing, stage, round]);

  function restore(s: Saved) {
    if (s.stage === 'results') record(s.game);
    setGame(s.game); setStage(s.stage); setSelected(s.deadline && s.deadline < Date.now() ? null : s.selected);
    setPoint(s.point); setDeadline(s.deadline); setGameOptions(s.options || defaults); setScreen('game'); setError('');
  }
  async function start(next: Mode) {
    if (busy) return;
    setError(''); setReview(null);
    if (next === 'daily') { const s = read<Saved | null>(`atlas:daily:daily-${today()}`, null); if (s?.game) { restore(s); return; } }
    setBusy(true);
    try {
      const g = await post<PublicGame>('/api/game', { mode: next, date: today(), previous: game?.questions.map(q => q.prompt) || [] });
      setGame(g); setStage('play'); setSelected(null); setPoint(null); setGameOptions({ ...options });
      setDeadline(options.timed ? Date.now() + ROUND_SECONDS * 1000 : null); setNow(Date.now()); setScreen('game');
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t start this expedition. Try again.'); }
    finally { setBusy(false); }
  }
  function nextRound() {
    setSelected(null); setPoint(null); setError('');
    if (game?.results.length === 5) { setStage('results'); record(game); return; }
    setStage('play'); setNow(Date.now()); setDeadline(gameOptions.timed ? Date.now() + ROUND_SECONDS * 1000 : null);
  }
  function select(code: string, p?: { x: number; y: number }) { if (busy || stage !== 'play') return; setSelected(code); setPoint(p || null); setError(''); }
  function goHome() { setScreen('home'); setError(''); }
  async function share() {
    if (!game) return;
    const squares = game.results.map(r => r.points === 5000 ? '🟨' : r.points >= 2000 ? '🟦' : r.points > 0 ? '🟩' : '⬜').join('');
    const label = game.mode === 'daily' ? `Daily trail ${today()}` : game.mode === 'ai' ? 'Purdue AI expedition' : 'Practice expedition';
    const text = `Atlas Drift: ${label}\n${squares}\n${km(total)} km, ${game.results.filter(r => r.points > 0).length}/5 correct\n${window.location.origin}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setError(`Clipboard unavailable. Your result: ${text}`); }
  }

  const ctaLabel = mode === 'daily' ? (dailyDone !== null ? 'View today’s result' : 'Start daily trail') : mode === 'ai' ? 'Generate expedition' : 'Start practice';
  return <div className={`app ${playing ? 'is-playing' : 'is-home'}`}>
    <a className="skip-link" href="#panel">Skip to {playing ? 'prompt' : 'game setup'}</a>
    <header className="topbar">
      <button type="button" className="brand" onClick={goHome} aria-label="Atlas Drift, home">
        <svg viewBox="-20 -20 40 40" aria-hidden="true" className="brand-mark"><circle r="15" /><path d="M0-17L4-4L17 0L4 4L0 17L-4 4L-17 0L-4-4Z" /><circle r="2" /></svg>
        <span>Atlas Drift</span>
      </button>
      <nav aria-label="Game">
        <button type="button" onClick={() => setModal('help')} aria-label="How to play"><CircleHelp size={18} strokeWidth={1.75} /><span>How to play</span></button>
        <button type="button" onClick={() => setModal('stats')} aria-label="Journal"><BookOpen size={18} strokeWidth={1.75} /><span>Journal</span></button>
        <button type="button" onClick={() => setModal('settings')} aria-label="Difficulty"><SlidersHorizontal size={18} strokeWidth={1.75} /><span>Difficulty</span></button>
      </nav>
    </header>

    <main className="workspace">

      <aside className="panel" id="panel" tabIndex={-1}>
        <div className="panel-content" key={panelKey}>
          {!playing ? <>
            <h1 className="home-title">Pin the country nobody else would.</h1>
            <p className="lede">Five prompts, one pin each. Every correct answer scores, and the less obvious it is, the further you travel.</p>

            <fieldset className="modes">
              <legend className="field-label">Choose an expedition</legend>
              {(Object.keys(MODES) as Mode[]).map(m => {
                const locked = m === 'ai' && !status?.connected;
                return <label key={m} className={`mode ${mode === m ? 'is-chosen' : ''} ${locked ? 'is-locked' : ''}`}>
                  <input type="radio" name="mode" value={m} checked={mode === m} disabled={locked} onChange={() => setMode(m)} />
                  <span className="mode-text">
                    <span className="mode-name">{MODES[m].label}
                      {m === 'daily' && dailyDone !== null && <span className="tag">Done · {km(dailyDone)} km</span>}
                      {locked && <span className="tag">Setup needed</span>}
                    </span>
                    <span className="mode-note">{MODES[m].note}</span>
                  </span>
                  {locked && <button type="button" className="link" onClick={() => setModal('connect')}>Connect</button>}
                </label>;
              })}
            </fieldset>

            <div className="difficulty-line">
              <span>{options.borders ? 'Borders on' : 'No borders'}, {options.names ? 'names on' : 'no names'}, {options.timed ? `${ROUND_SECONDS}s per pin` : 'untimed'}</span>
              <button type="button" className="link" onClick={() => setModal('settings')}>Change</button>
            </div>

            <div className="sticky-action">
              <button type="button" className="btn btn-primary btn-block" disabled={busy || !ready} onClick={() => start(mode)}>
                {busy ? <><LoaderCircle className="spin" size={18} />{mode === 'ai' ? 'Writing your prompts' : 'Unfolding the map'}</> : <>{ctaLabel}<ArrowRight size={18} /></>}
              </button>
            </div>
            {busy && mode === 'ai' && <p className="hint" role="status">Purdue is writing five prompts and their answer lists. This can take up to two minutes.</p>}
            {error && <p className="error" role="alert">{error}</p>}
            {inProgress && !busy && <button type="button" className="resume" onClick={() => { setScreen('game'); setError(''); }}>
              <span><b>Resume {MODE_NAMES[game!.mode].toLowerCase()}</b> Round {round + 1} of 5, {km(total)} km so far</span><ArrowRight size={16} />
            </button>}

            <Ornament />
            <section className="scoring" aria-labelledby="scoring-title">
              <h2 id="scoring-title" className="field-label">Scoring</h2>
              <TierScale />
            </section>
          </> : stage !== 'results' ? <>
            <div className="hud">
              <button type="button" className="btn-icon" onClick={goHome} aria-label="Back to home"><ArrowLeft size={18} strokeWidth={1.75} /></button>
              <ol className="rounds" aria-label={`Round ${round + 1} of 5`}>
                {Array.from({ length: 5 }, (_, i) => {
                  const r = game!.results[i];
                  const state = r ? (r.points ? `tier-${tierOf(r.points)}` : 'miss') : i === round ? 'current' : '';
                  return <li key={i} className={state} aria-label={r ? `Round ${i + 1}: ${r.points ? `${km(r.points)} km` : 'miss'}` : `Round ${i + 1}`} />;
                })}
              </ol>
              <span className="score"><span className="num">{km(total)}</span> km</span>
            </div>

            <p className="meta"><span>{question?.category}</span><span className="num">{round + 1}/5</span></p>
            <h1 className="prompt" ref={heading} tabIndex={-1}>{question?.prompt}</h1>
            <details className="rules"><summary>Rules<ChevronDown size={14} /></summary><p>{question?.rule}</p></details>

            {stage === 'play' ? <>
              {gameOptions.timed && <div className={`timer ${remaining <= 15 ? 'is-urgent' : ''}`} role="timer" aria-label={`${remaining} seconds left`}>
                <div className="timer-track"><div className="timer-fill" style={{ transform: `scaleX(${remaining / ROUND_SECONDS})` }} /></div>
                <span className="num">{remaining}s</span>
              </div>}
              <div className={`pick ${selected ? 'has-pick' : ''}`} aria-live="polite">
                <MapPin size={18} strokeWidth={1.75} aria-hidden="true" />
                <span><span className="field-label">Your pin</span>
                  <strong>{selected ? (gameOptions.names ? countryName(selected) : 'Country selected') : 'Tap the map or search'}</strong></span>
              </div>
              {gameOptions.names && <CountrySearch onPick={code => select(code)} disabled={busy} />}
              <div className="sticky-action">
                <button type="button" className="btn btn-primary btn-block" disabled={!selected || busy} onClick={() => submit(selected)}>
                  {busy ? <><LoaderCircle size={18} className="spin" />Checking</> : <>Drop pin<ArrowRight size={18} /></>}
                </button>
              </div>
            </> : result && <>
              <div className={`verdict ${result.points ? `tier-${tierOf(result.points)}` : 'is-miss'}`} role="status">
                <span className="verdict-label">{result.points ? TIERS[tierOf(result.points)].name : 'Not on the list'}</span>
                <strong className="num">{result.points ? `+${km(result.points)} km` : '0 km'}</strong>
              </div>
              <p className="fact"><b>{countryName(result.country)}.</b> {result.fact}</p>
              <details className="answers">
                <summary>All {result.answers.length} accepted answers<ChevronDown size={14} /></summary>
                <AnswerList result={result} />
              </details>
              <div className="sticky-action">
                <button type="button" className="btn btn-primary btn-block" onClick={nextRound}>
                  {game?.results.length === 5 ? 'See results' : 'Next prompt'}<ArrowRight size={18} />
                </button>
              </div>
            </>}
            {error && <p className="error" role="alert">{error}</p>}
            {game?.mode === 'ai' && <p className="hint"><Sparkles size={13} aria-hidden="true" /> AI-written prompt. Rarity is an editorial estimate.</p>}
          </> : <>
            <div className="hud">
              <button type="button" className="btn-icon" onClick={goHome} aria-label="Back to home"><ArrowLeft size={18} strokeWidth={1.75} /></button>
              <span className="hud-title">{MODE_NAMES[game!.mode]}</span>
            </div>
            <h1 className="total" ref={heading} tabIndex={-1}><span className="num">{km(total)}</span> km</h1>
            <p className="lede">{game!.results.filter(r => r.points > 0).length} of 5 correct{game!.results.some(r => r.points === 5000) && `, ${game!.results.filter(r => r.points === 5000).length} Farflung`}.</p>
            <ol className="recap">
              {game!.results.map((r, i) => <li key={i}>
                <button type="button" className="recap-row" onClick={() => setReview(review === i ? null : i)} aria-expanded={review === i}>
                  <span className={`chip ${r.points ? `tier-${tierOf(r.points)}` : 'miss'}`} aria-hidden="true" />
                  <span className="recap-text"><small>{game!.questions[i].category}</small><b>{countryName(r.country)}</b></span>
                  <span className="num recap-points">{r.points ? `+${km(r.points)}` : 'Miss'}</span>
                  <ChevronDown size={16} className="chev" />
                </button>
                {review === i && <div className="recap-detail"><p className="recap-q">{r.question}</p><p>{r.fact}</p><AnswerList result={r} /></div>}
              </li>)}
            </ol>
            <Ornament />
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={share}>{copied ? <Check size={18} /> : <Copy size={17} />}{copied ? 'Copied' : 'Copy result'}</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => start(game?.mode === 'ai' ? 'ai' : 'practice')}>
                {busy ? <LoaderCircle size={17} className="spin" /> : <RotateCcw size={17} />}{game?.mode === 'ai' ? 'New AI expedition' : 'Play practice'}
              </button>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
          </>}
        </div>
      </aside>
      <section className="map-area" aria-label="Map">
        <WorldMap active={playing && stage === 'play' && !busy} selected={playing ? selected : null} point={playing ? point : null} onSelect={select}
          showBorders={playing ? gameOptions.borders : true} showNames={playing ? gameOptions.names : false}
          answers={playing && result ? result.answers : undefined} wrong={!!result && !result.points}
          frameKey={playing ? `${game?.id}-${round}-${stage === 'reveal' ? 'r' : 'p'}` : 'home'} />
        {playing && stage === 'reveal' && <MapLegend />}
      </section>
    </main>

    <Dialog open={modal !== null} onClose={() => setModal(null)} title={modal === 'help' ? 'How to play' : modal === 'settings' ? 'Difficulty' : modal === 'stats' ? 'Journal' : 'Connect Purdue AI'}>
      {modal === 'help' && <>
        <ol className="steps">
          <li><b>Read the prompt.</b> Several countries fit. Pick any one that follows the rules.</li>
          <li><b>Place your pin.</b> Tap a country, zoom in for small ones, or search by name. Then press Drop pin.</li>
          <li><b>Go further.</b> Less obvious correct answers score more. A wrong pin scores zero.</li>
        </ol>
        <TierScale />
        <p className="note">Keyboard: arrows pan, + and − zoom, 0 resets, Enter pins the country under the crosshair. Territories count for their parent country. Disputed regions can’t be picked. You can reuse a country on a later prompt.</p>
        <button type="button" className="btn btn-primary btn-block" onClick={() => setModal(null)}>Got it</button>
      </>}
      {modal === 'settings' && <>
        <p className="note">Applies to your next expedition.</p>
        <Toggle title="Country borders" description="Outline every country on the map." checked={options.borders} onChange={() => setOptions(s => ({ ...s, borders: !s.borders }))} />
        <Toggle title="Country names" description="Show names on hover and allow search." checked={options.names} onChange={() => setOptions(s => ({ ...s, names: !s.names }))} />
        <Toggle title="Timer" description={`${ROUND_SECONDS} seconds per pin. Your selection is submitted when time runs out.`} checked={options.timed} onChange={() => setOptions(s => ({ ...s, timed: !s.timed }))} />
        <button type="button" className="btn btn-primary btn-block" onClick={() => setModal(null)}>Done</button>
      </>}
      {modal === 'stats' && <>
        <dl className="stats">
          <div><dt>Expeditions</dt><dd className="num">{history.length}</dd></div>
          <div><dt>Best</dt><dd className="num">{km(Math.max(0, ...history.map(h => h.score)))} km</dd></div>
          <div><dt>Correct pins</dt><dd className="num">{history.length ? Math.round(history.reduce((s, h) => s + h.correct, 0) / (history.length * 5) * 100) : 0}%</dd></div>
        </dl>
        {history.length ? <ol className="journal">{history.slice(0, 10).map(h => <li key={h.id}>
          <span>{new Date(`${h.date}T12:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<small>{MODE_NAMES[h.mode] || h.mode}</small></span>
          <span className="num">{h.correct}/5</span>
          <b className="num">{km(h.score)} km</b>
        </li>)}</ol> : <p className="empty">No expeditions yet. Finish one and it will show up here.</p>}
        <p className="note">Saved in this browser only. Clearing site data resets your journal and today’s attempt.</p>
      </>}
      {modal === 'connect' && <>
        <p>Purdue GenAI Studio writes five new prompts, the accepted countries and their rarity for every AI expedition.</p>
        <p className={`connection ${status?.connected ? 'is-on' : ''}`}>{status?.connected ? `Connected to ${status.model}` : 'Not configured on this server'}</p>
        <p className="note">For local play, add these to the ignored <code>.dev.vars</code> file and restart. For the hosted app, add them as runtime secrets.</p>
        <pre>GENAI_API_KEY=your_purdue_key{'\n'}GENAI_MODEL=your_model_id{'\n'}GAME_SECRET=a_long_random_secret</pre>
        <p className="note">Create a key in GenAI Studio under Settings, Account, API Keys. Use the exact model ID from <code>/api/models</code>. Optional: <code>GENAI_BACKEND=vllm</code> or <code>ollama</code> for structured output.</p>
        <p className="note">Keys stay on the server. Output is checked for structure and country codes, but facts can still be wrong.</p>
        <a className="link" href="https://docs.rcac.purdue.edu/services/genai/api/" target="_blank" rel="noreferrer">Purdue API guide<ArrowRight size={14} /></a>
      </>}
    </Dialog>
  </div>;
}

function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onClose={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <div className="dialog-body">
      <header className="dialog-head"><h2 id="dialog-title">{title}</h2>
        <button type="button" className="btn-icon" aria-label="Close" onClick={onClose}><X size={18} strokeWidth={1.75} /></button></header>
      {open && children}
    </div>
  </dialog>;
}

function Toggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: () => void }) {
  return <button type="button" className="toggle-row" role="switch" aria-checked={checked} onClick={onChange}>
    <span><b>{title}</b><small>{description}</small></span>
    <span className={`switch ${checked ? 'is-on' : ''}`} aria-hidden="true"><span /></span>
  </button>;
}

/** A ruled divider with a centre lozenge, as used between sections of an atlas page. */
function Ornament() {
  return <div className="ornament" role="presentation"><span /></div>;
}

function TierScale() {
  return <ol className="tiers">{TIERS.map((t, i) => <li key={t.name}><span className={`chip tier-${i}`} aria-hidden="true" />{t.name}<span className="num">{km(t.points)}</span></li>)}</ol>;
}

function MapLegend() {
  return <div className="map-legend" aria-hidden="true">{TIERS.map((t, i) => <span key={t.name}><span className={`chip tier-${i}`} />{t.name}</span>)}</div>;
}

function AnswerList({ result }: { result: Result }) {
  return <div className="answer-list">
    <ul>{[...result.answers].sort((a, b) => b.points - a.points || countryName(a.country).localeCompare(countryName(b.country))).map(a =>
      <li key={a.country} className={a.country === result.country ? 'is-yours' : ''}>
        <span className={`chip tier-${tierOf(a.points)}`} aria-hidden="true" />
        <span>{countryName(a.country)}{a.country === result.country && <span className="tag">Your pin</span>}</span>
        <span className="num">{km(a.points)}</span>
      </li>)}</ul>
    <a className="link" href={result.source} target="_blank" rel="noreferrer">Source<ArrowRight size={13} /></a>
  </div>;
}
