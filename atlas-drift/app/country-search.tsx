'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import countries from '@/lib/countries.json';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const index = countries.map(c => ({ code: c.code, name: c.name, keys: [c.name, ...c.aliases].map(fold) }));

function rank(query: string) {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: { code: string; name: string; score: number }[] = [];
  for (const c of index) {
    let score = 99;
    c.keys.forEach((k, i) => {
      const s = k === q ? 0 : k.startsWith(q) ? 1 : k.split(/[\s-]/).some(w => w.startsWith(q)) ? 2 : q.length > 2 && k.includes(q) ? 3 : 99;
      score = Math.min(score, s + (i ? 0.5 : 0));
    });
    if (score < 99) scored.push({ code: c.code, name: c.name, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, 7);
}

/** Accessible combobox: type to filter, arrows to move, Enter to choose, Escape to close. */
export default function CountrySearch({ onPick, disabled }: { onPick: (code: string) => void; disabled?: boolean }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const results = useMemo(() => rank(query), [query]);
  const showList = open && results.length > 0;

  const choose = (code: string) => {
    onPick(code);
    setQuery('');
    setOpen(false);
    setActive(0);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && showList) { e.preventDefault(); choose(results[active].code); }
    else if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); } setOpen(false); }
  };

  return <div className="search">
    <label htmlFor={`${id}-input`} className="field-label">Search countries</label>
    <div className="search-field">
      <Search size={16} strokeWidth={1.75} aria-hidden="true" />
      <input ref={input} id={`${id}-input`} type="text" role="combobox" autoComplete="off" spellCheck={false} disabled={disabled}
        aria-expanded={showList} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={showList ? `${id}-${results[active]?.code}` : undefined}
        placeholder="Type a name, e.g. Bhutan" value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown} />
    </div>
    <ul id={`${id}-list`} role="listbox" aria-label="Matching countries" className="search-list" hidden={!showList}>
      {results.map((r, i) => <li key={r.code} id={`${id}-${r.code}`} role="option" aria-selected={i === active}
        onMouseDown={e => e.preventDefault()} onClick={() => choose(r.code)} onMouseMove={() => setActive(i)}>{r.name}</li>)}
    </ul>
    {open && query.trim().length > 1 && !results.length && <p className="search-empty">No country matches “{query.trim()}”.</p>}
  </div>;
}
