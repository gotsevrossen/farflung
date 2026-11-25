'use client';
import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import countries from '@/lib/countries.json';
import { TIERS, type Answer } from '@/lib/game';

type Shape = { code: string | null; name: string; path: string };
type Point = { x: number; y: number };
type View = { k: number; x: number; y: number };
type Props = {
  active: boolean;
  selected: string | null;
  point: Point | null;
  onSelect: (code: string, point?: Point) => void;
  showBorders: boolean;
  showNames: boolean;
  answers?: Answer[];
  wrong?: boolean;
  /** Changes whenever the map should re-frame itself (new round, reveal, screen change). */
  frameKey: string;
};

/* Equirectangular projection, 3 units per degree. The view is cropped to roughly 85°N to 57°S:
   Antarctica is not selectable and the polar band only wastes space. */
const W = 1080;
const VB = { x: 0, y: 15, w: W, h: 426 };
const MAX_K = 10;
const PIN_LIFT = 4;

/* Countries too small to click reliably at world scale get a target dot. */
const SMALL = new Set(['VAT', 'MCO', 'SMR', 'LIE', 'AND', 'SGP', 'BHR', 'MLT', 'MDV', 'STP', 'COM', 'SYC', 'CPV', 'MUS', 'BRB', 'GRD', 'ATG', 'KNA', 'DMA', 'LCA', 'VCT']);
const byCode = new Map(countries.map(c => [c.code, c]));
const tierIndex = (points: number) => TIERS.findIndex(t => t.points === points);

let shapesRequest: Promise<Shape[]> | null = null;
function loadShapes() {
  shapesRequest ??= fetch('/world.json')
    .then(r => { if (!r.ok) throw new Error('map'); return r.json() as Promise<Shape[]>; })
    .catch(error => { shapesRequest = null; throw error; });
  return shapesRequest;
}

function clamp(v: View): View {
  const k = Math.min(MAX_K, Math.max(1, v.k));
  const x = Math.min(VB.x * (1 - k), Math.max((VB.x + VB.w) * (1 - k), v.x));
  const y = Math.min(VB.y * (1 - k), Math.max((VB.y + VB.h) * (1 - k), v.y));
  return { k, x, y };
}
const IDENTITY: View = { k: 1, x: 0, y: 0 };
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Static layers are memoised so panning, zooming and hovering never re-render 235 paths. */
const Graticule = memo(function Graticule() {
  const lines: React.ReactNode[] = [];
  /* Lines run well past the projection so letterboxed ocean keeps the same chart texture. */
  for (let lon = -330; lon <= 330; lon += 30) if (lon !== 180 && lon !== -180) lines.push(<line key={`x${lon}`} x1={(lon + 180) * 3} x2={(lon + 180) * 3} y1={-900} y2={1440} />);
  for (let lat = -240; lat <= 240; lat += 30) lines.push(<line key={`y${lat}`} x1={-1080} x2={2160} y1={(90 - lat) * 3} y2={(90 - lat) * 3} className={lat === 0 ? 'equator' : undefined} />);
  return <g className="graticule" aria-hidden="true">{lines}</g>;
});

const SeaLabels = memo(function SeaLabels() {
  return <g className="sea-labels" aria-hidden="true">
    <text x="215" y="290">Pacific Ocean</text>
    <text x="1005" y="250">Pacific</text>
    <text x="465" y="232">Atlantic</text>
    <text x="465" y="244">Ocean</text>
    <text x="790" y="345">Indian Ocean</text>
    <text x="930" y="31">Arctic Ocean</text>
    <text x="470" y="430">Southern Ocean</text>
  </g>;
});

type LandProps = { shapes: Shape[]; selected: string | null; answers?: Answer[]; wrong?: boolean; showDots: boolean };
const Land = memo(function Land({ shapes, selected, answers, wrong, showDots }: LandProps) {
  const tiers = useMemo(() => new Map(answers?.map(a => [a.country, tierIndex(a.points)])), [answers]);
  const drawn = useMemo(() => new Set(shapes.map(s => s.code)), [shapes]);
  const classFor = (code: string | null) => {
    if (!code) return 'country';
    const tier = tiers.get(code);
    const parts = ['country', 'selectable'];
    if (tier !== undefined) parts.push(`tier-${tier}`);
    if (code === selected) parts.push(answers ? (wrong ? 'picked-wrong' : 'picked-right') : 'picked');
    return parts.join(' ');
  };
  const dots = showDots ? countries.filter(c => !drawn.has(c.code) || SMALL.has(c.code)) : [];
  return <>
    <g className="land">
      {shapes.map((s, i) => <path key={i} d={s.path} data-country={s.code || undefined} data-name={s.name} className={classFor(s.code)} />)}
    </g>
    <g className="dots">
      {dots.map(c => <circle key={c.code} cx={c.x} cy={c.y} r={2.4} data-country={c.code} data-name={c.name} className={`dot ${classFor(c.code)}`} />)}
    </g>
  </>;
});

export default function WorldMap({ active, selected, point, onSelect, showBorders, showNames, answers, wrong, frameKey }: Props) {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [failed, setFailed] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const zoomLayer = useRef<SVGGElement>(null);
  const pinLayer = useRef<SVGGElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const view = useRef<View>(IDENTITY);
  const frame = useRef(0);
  const animation = useRef(0);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ start: Point; view: View; moved: boolean; pinch?: { distance: number; mid: Point; view: View } } | null>(null);
  const pinAt = useRef<Point | null>(null);

  useEffect(() => { loadShapes().then(setShapes).catch(() => setFailed(true)); }, []);

  /* Writes the current view straight to the DOM; React is not involved in pan/zoom frames. */
  const paint = useCallback(() => {
    frame.current = 0;
    const { k, x, y } = view.current;
    zoomLayer.current?.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})`);
    svg.current?.style.setProperty('--k', String(k));
    const r = (2.4 / Math.sqrt(k)).toFixed(2);
    zoomLayer.current?.querySelectorAll<SVGCircleElement>('.dot').forEach(d => d.setAttribute('r', r));
    const p = pinAt.current;
    if (pinLayer.current) {
      if (p) { pinLayer.current.setAttribute('transform', `translate(${(p.x * k + x).toFixed(2)} ${(p.y * k + y).toFixed(2)})`); pinLayer.current.style.display = ''; }
      else pinLayer.current.style.display = 'none';
    }
  }, []);
  const setView = useCallback((next: View) => {
    view.current = clamp(next);
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  }, [paint]);
  const stopAnimation = () => { cancelAnimationFrame(animation.current); animation.current = 0; };

  const animateTo = useCallback((target: View, duration = 650) => {
    stopAnimation();
    const goal = clamp(target);
    if (reducedMotion() || duration === 0) { setView(goal); return; }
    const from = view.current;
    const centre = (v: View) => ({ x: (VB.x + VB.w / 2 - v.x) / v.k, y: (VB.y + VB.h / 2 - v.y) / v.k });
    const a = centre(from), b = centre(goal);
    const started = performance.now();
    const step = (now: number) => {
      const t = easeOutQuart(Math.min(1, (now - started) / duration));
      const k = from.k * Math.pow(goal.k / from.k, t);
      const cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t;
      setView({ k, x: VB.x + VB.w / 2 - cx * k, y: VB.y + VB.h / 2 - cy * k });
      animation.current = t < 1 ? requestAnimationFrame(step) : 0;
    };
    animation.current = requestAnimationFrame(step);
  }, [setView]);

  const zoomAround = useCallback((anchor: Point, factor: number, from = view.current) => {
    const k = Math.min(MAX_K, Math.max(1, from.k * factor));
    const ratio = k / from.k;
    setView({ k, x: anchor.x - (anchor.x - from.x) * ratio, y: anchor.y - (anchor.y - from.y) * ratio });
  }, [setView]);

  const toViewBox = (clientX: number, clientY: number): Point | null => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const toContent = (p: Point): Point => ({ x: (p.x - view.current.x) / view.current.k, y: (p.y - view.current.y) / view.current.k });
  /** The area actually on screen, in viewBox units (larger than VB when letterboxed). */
  const visible = useCallback(() => {
    const rect = svg.current?.getBoundingClientRect();
    const scale = rect && rect.width ? Math.min(rect.width / VB.w, rect.height / VB.h) : 1;
    return { w: rect?.width ? rect.width / scale : VB.w, h: rect?.height ? rect.height / scale : VB.h };
  }, []);
  /** Starting view: the whole world, or on tall portrait screens a closer view centred on Africa and Europe. */
  const baseView = useCallback((): View => {
    const { w, h } = visible();
    const stretch = (h / w) / (VB.h / VB.w);
    if (stretch < 1.6) return IDENTITY;
    const k = Math.min(1.8, Math.max(1, stretch * 0.55));
    return { k, x: VB.x + VB.w / 2 - 585 * k, y: VB.y + VB.h / 2 - 225 * k };
  }, [visible]);

  /* Keep the pin overlay in sync with the selected point. */
  useEffect(() => {
    const c = selected ? byCode.get(selected) : undefined;
    pinAt.current = selected ? (point || (c ? { x: c.x, y: c.y } : null)) : null;
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  }, [selected, point, paint]);

  /* Re-frame on round changes and reveals: fit the accepted answers, or return to the whole world. */
  const reframe = useEffectEvent(() => {
    const list = answers;
    if (!list?.length) { animateTo(baseView(), 500); return; }
    const pts = list.map(a => byCode.get(a.country)).filter(Boolean).map(c => ({ x: c!.x, y: c!.y }));
    if (pinAt.current) pts.push(pinAt.current);
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const pad = 60;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    const { w, h } = visible();
    const k = Math.min(4, Math.max(1, Math.min(w / (maxX - minX), h / (maxY - minY))));
    animateTo({ k, x: VB.x + VB.w / 2 - ((minX + maxX) / 2) * k, y: VB.y + VB.h / 2 - ((minY + maxY) / 2) * k }, 800);
  });
  useEffect(() => { reframe(); }, [frameKey]);

  /* Wheel and trackpad zoom need a non-passive listener to stop the page scrolling. */
  useEffect(() => {
    const el = svg.current;
    if (!el || !active) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      stopAnimation();
      const anchor = toViewBox(event.clientX, event.clientY);
      if (!anchor) return;
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAround(anchor, Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0022)));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [active, zoomAround]);

  /* A React render can replace dot elements; repaint so their zoom-scaled radius sticks. */
  useEffect(() => { if (!frame.current) frame.current = requestAnimationFrame(paint); });
  useEffect(() => () => { cancelAnimationFrame(frame.current); cancelAnimationFrame(animation.current); }, []);

  const hideTip = () => { if (tip.current) tip.current.style.opacity = '0'; };
  const showTip = (event: React.PointerEvent) => {
    if (!tip.current || !showNames || !active || event.pointerType !== 'mouse' || gesture.current?.moved) { hideTip(); return; }
    const target = event.target as Element;
    const code = target.getAttribute('data-country');
    if (!code) { hideTip(); return; }
    const rect = svg.current!.getBoundingClientRect();
    tip.current.textContent = byCode.get(code)?.name || target.getAttribute('data-name') || '';
    tip.current.style.transform = `translate(${event.clientX - rect.left + 14}px, ${event.clientY - rect.top + 16}px)`;
    tip.current.style.opacity = '1';
  };

  const pickAt = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    const code = el?.getAttribute('data-country');
    if (!code) return;
    if (el instanceof SVGCircleElement) { const c = byCode.get(code); if (c) { onSelect(code, { x: c.x, y: c.y }); return; } }
    const p = toViewBox(clientX, clientY);
    onSelect(code, p ? toContent(p) : undefined);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stopAnimation();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 1) gesture.current = { start: { x: e.clientX, y: e.clientY }, view: view.current, moved: false };
    else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const mid = toViewBox((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (mid) gesture.current = { ...gesture.current, moved: true, pinch: { distance: Math.hypot(a.x - b.x, a.y - b.y), mid, view: view.current } };
    }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    showTip(e);
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const scale = svg.current?.getScreenCTM()?.a || 1;
    if (g.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = toViewBox((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (!mid) return;
      const k = Math.min(MAX_K, Math.max(1, g.pinch.view.k * Math.hypot(a.x - b.x, a.y - b.y) / g.pinch.distance));
      const ratio = k / g.pinch.view.k;
      setView({ k, x: mid.x - (g.pinch.mid.x - g.pinch.view.x) * ratio, y: mid.y - (g.pinch.mid.y - g.pinch.view.y) * ratio });
      return;
    }
    const dx = e.clientX - g.start.x, dy = e.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < (e.pointerType === 'mouse' ? 4 : 9)) return;
    if (!g.moved) { g.moved = true; svg.current?.classList.add('dragging'); hideTip(); }
    setView({ k: g.view.k, x: g.view.x + dx / scale, y: g.view.y + dy / scale });
  };
  const endPointer = (e: React.PointerEvent<SVGSVGElement>, cancelled = false) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 0) {
      gesture.current = null;
      svg.current?.classList.remove('dragging');
      if (g && !g.moved && !cancelled) pickAt(e.clientX, e.clientY);
    } else if (g?.pinch) {
      /* One finger lifted after a pinch: continue as a pan from here without selecting. */
      const [rest] = [...pointers.current.values()];
      gesture.current = { start: rest, view: view.current, moved: true };
    }
  };

  const centrePick = () => {
    const p = toContent({ x: VB.x + VB.w / 2, y: VB.y + VB.h / 2 });
    const probe = new DOMPoint(p.x, p.y);
    for (const path of zoomLayer.current?.querySelectorAll<SVGPathElement>('path[data-country]') || []) {
      if (path.isPointInFill(probe)) { onSelect(path.dataset.country!, p); return; }
    }
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!active) return;
    const step = 50, v = view.current, centre = { x: VB.x + VB.w / 2, y: VB.y + VB.h / 2 };
    const actions: Record<string, () => void> = {
      ArrowLeft: () => setView({ ...v, x: v.x + step }),
      ArrowRight: () => setView({ ...v, x: v.x - step }),
      ArrowUp: () => setView({ ...v, y: v.y + step }),
      ArrowDown: () => setView({ ...v, y: v.y - step }),
      '+': () => zoomAround(centre, 1.4), '=': () => zoomAround(centre, 1.4), '-': () => zoomAround(centre, 1 / 1.4),
      '0': () => animateTo(baseView(), 400), Enter: centrePick, ' ': centrePick,
    };
    const action = actions[e.key];
    if (action) { e.preventDefault(); stopAnimation(); action(); }
  };

  const centre = { x: VB.x + VB.w / 2, y: VB.y + VB.h / 2 };
  return <div className={`world-map ${active ? 'interactive' : ''} ${answers ? 'revealed' : ''} ${showBorders ? 'bordered' : ''}`}>
    <svg ref={svg} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet"
      role="application" aria-roledescription="map" tabIndex={active ? 0 : -1}
      aria-label={active ? 'World map. Arrow keys pan, plus and minus zoom, 0 resets, Enter pins the country under the centre crosshair.' : 'World map'}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={e => endPointer(e)} onPointerCancel={e => endPointer(e, true)}
      onPointerLeave={hideTip} onKeyDown={onKeyDown}>
      <g ref={zoomLayer}>
        <Graticule />
        <SeaLabels />
        {shapes.length > 0 && <Land shapes={shapes} selected={selected} answers={answers} wrong={wrong} showDots={active || !!answers} />}
      </g>
      <g ref={pinLayer} className={`pin ${answers ? (wrong ? 'is-wrong' : 'is-right') : ''}`} style={{ display: 'none' }} aria-hidden="true">
        <ellipse cy="1" rx="5" ry="1.6" className="pin-shadow" />
        <path d={`M0 ${-PIN_LIFT + 4}C-1.6 ${-PIN_LIFT}-8 ${-PIN_LIFT - 6}-8 ${-PIN_LIFT - 13}a8 8 0 0116 0C8 ${-PIN_LIFT - 6} 1.6 ${-PIN_LIFT} 0 ${-PIN_LIFT + 4}Z`} className="pin-body" />
        <circle cy={-PIN_LIFT - 13} r="2.6" className="pin-eye" />
      </g>
      <g className="crosshair" aria-hidden="true"><circle cx={centre.x} cy={centre.y} r="7" /><path d={`M${centre.x} ${centre.y - 14}v6m0 16v6m-14-14h6m16 0h6`} /></g>
    </svg>
    <div ref={tip} className="map-tip" aria-hidden="true" />
    {failed && <p className="map-error">The map didn’t load. You can still pick countries with search.</p>}
    {!shapes.length && !failed && <div className="map-loading" aria-hidden="true" />}
    {active && <div className="map-controls" role="toolbar" aria-label="Map zoom">
      <button type="button" aria-label="Zoom in" onClick={() => { stopAnimation(); zoomAround(centre, 1.6); }}><Plus size={18} strokeWidth={1.75} /></button>
      <button type="button" aria-label="Zoom out" onClick={() => { stopAnimation(); zoomAround(centre, 1 / 1.6); }}><Minus size={18} strokeWidth={1.75} /></button>
      <button type="button" aria-label="Show whole world" onClick={() => animateTo(baseView(), 450)}><LocateFixed size={17} strokeWidth={1.75} /></button>
    </div>}
  </div>;
}
