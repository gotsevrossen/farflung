'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import countries from '@/lib/countries.json';
import { TIERS, type Answer } from '@/lib/game';

type Shape={code:string|null;name:string;path:string};
type Point={x:number;y:number};
type Props={active:boolean;selected:string|null;point:Point|null;onSelect:(code:string,point?:Point)=>void;showBorders:boolean;showNames:boolean;answers?:Answer[];wrong?:boolean};
export default function WorldMap({active,selected,point,onSelect,showBorders,showNames,answers,wrong}:Props){
  const [shapes,setShapes]=useState<Shape[]>([]);const [failed,setFailed]=useState(false);const [view,setView]=useState({zoom:1,pan:{x:0,y:0}});const {zoom,pan}=view;const [hover,setHover]=useState<string|null>(null);
  const svg=useRef<SVGSVGElement>(null);const group=useRef<SVGGElement>(null);const drag=useRef<{x:number;y:number;pan:Point;moved:boolean}|null>(null);const moved=useRef(false);
  useEffect(()=>{fetch('/world.json').then(r=>{if(!r.ok)throw new Error();return r.json() as Promise<Shape[]>;}).then(setShapes).catch(()=>setFailed(true));},[]);
  const zoomAtCursor=useCallback((clientX:number,clientY:number,factor:number)=>{
    const matrix=svg.current?.getScreenCTM();if(!matrix)return;
    const cursor=new DOMPoint(clientX,clientY).matrixTransform(matrix.inverse());
    setView(current=>{const zoom=Math.min(7,Math.max(1,current.zoom*factor));if(zoom===current.zoom)return current;return {zoom,pan:{x:cursor.x-540-((cursor.x-540-current.pan.x)/current.zoom)*zoom,y:cursor.y-270-((cursor.y-270-current.pan.y)/current.zoom)*zoom}};});
  },[]);
  useEffect(()=>{const el=svg.current;if(!el)return;const wheel=(event:WheelEvent)=>{if(!active)return;event.preventDefault();zoomAtCursor(event.clientX,event.clientY,event.deltaY<0?1.12:0.89);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[active,zoomAtCursor]);
  const country=countries.find(c=>c.code===selected);const pin=point||country;const colors=new Map(answers?.map(a=>[a.country,TIERS.find(t=>t.points===a.points)!.color]));
  const select=(code:string|null,event?:React.MouseEvent)=>{if(!active||!code||moved.current)return;let pos:Point|undefined;if(event&&group.current){const matrix=group.current.getScreenCTM();if(matrix){const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());pos={x:p.x,y:p.y};}}onSelect(code,pos);};
  function centerPin(){const p=new DOMPoint(540-pan.x/zoom,270-pan.y/zoom);const paths=group.current?.querySelectorAll<SVGPathElement>('path[data-country]');for(const path of paths||[]){if(path.isPointInFill(p)){const code=path.dataset.country;if(code)onSelect(code,{x:p.x,y:p.y});return;}}}
  return <div className={`world-map ${active?'interactive':''} ${answers?'revealed-map':''}`}>
    <svg ref={svg} viewBox="0 0 1080 540" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Interactive world map. Arrow keys pan, plus and minus zoom, Enter places a pin at the center. You can also use the country selector." tabIndex={active?0:-1}
      onPointerDown={e=>{if(!active||e.button!==0)return;drag.current={x:e.clientX,y:e.clientY,pan:{...pan},moved:false};moved.current=false;}}
      onPointerMove={e=>{if(!drag.current||!active)return;const dx=e.clientX-drag.current.x,dy=e.clientY-drag.current.y;if(Math.abs(dx)+Math.abs(dy)>5){drag.current.moved=true;moved.current=true;const ratio=1080/(svg.current?.getBoundingClientRect().width||1080),nextPan={x:Math.max(-500*zoom,Math.min(500*zoom,drag.current.pan.x+dx*ratio)),y:Math.max(-250*zoom,Math.min(250*zoom,drag.current.pan.y+dy*ratio))};setView(v=>({...v,pan:nextPan}));}}}
      onPointerUp={()=>{drag.current=null;}} onPointerLeave={()=>{drag.current=null;setHover(null);}}
      onKeyDown={e=>{if(!active)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Enter',' '].includes(e.key))e.preventDefault();if(e.key==='ArrowLeft')setView(v=>({...v,pan:{...v.pan,x:v.pan.x+30}}));if(e.key==='ArrowRight')setView(v=>({...v,pan:{...v.pan,x:v.pan.x-30}}));if(e.key==='ArrowUp')setView(v=>({...v,pan:{...v.pan,y:v.pan.y+30}}));if(e.key==='ArrowDown')setView(v=>({...v,pan:{...v.pan,y:v.pan.y-30}}));if(e.key==='+'||e.key==='=')setView(v=>({...v,zoom:Math.min(7,v.zoom*1.3)}));if(e.key==='-')setView(v=>({...v,zoom:Math.max(1,v.zoom/1.3)}));if(e.key==='Enter'||e.key===' ')centerPin();}}>
      <defs><pattern id="map-grid" width="90" height="90" patternUnits="userSpaceOnUse"><path d="M90 0H0V90" fill="none" stroke="#647f7c" strokeOpacity=".14" strokeWidth=".7"/></pattern><filter id="land-shadow"><feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#506e65" floodOpacity=".16"/></filter></defs>
      <rect width="1080" height="540" fill="url(#map-grid)"/>
      <g ref={group} transform={`translate(${540+pan.x} ${270+pan.y}) scale(${zoom}) translate(-540 -270)`}>
        <g className="countries" filter="url(#land-shadow)">{shapes.map((s,i)=><path key={i} data-country={s.code||undefined} d={s.path} fill={s.code===selected?(wrong?'#b85b45':'#c17c50'):(s.code&&colors.get(s.code))||'#e9e6d8'} stroke={showBorders?'#a6ab94':'none'} strokeWidth={0.6} vectorEffect="non-scaling-stroke" className={s.code?'country':''} onClick={e=>select(s.code,e)} onMouseEnter={()=>setHover(s.code)} onMouseLeave={()=>setHover(null)}><title>{showNames&&active?s.name:''}</title></path>)}</g>
        <g className="sea-labels" aria-hidden="true" fill="#577d7b"><text x="223" y="285">PACIFIC OCEAN</text><text x="459" y="235">ATLANTIC</text><text x="466" y="252">OCEAN</text><text x="772" y="338">INDIAN OCEAN</text><text x="1009" y="260">PACIFIC</text><text x="1016" y="277">OCEAN</text><text x="575" y="76">ARCTIC OCEAN</text></g>
        {active&&countries.filter(c=>!shapes.some(s=>s.code===c.code)||['VAT','MCO','SMR','LIE','AND','SGP','BHR','MLT','MDV','STP','COM','SYC','CPV','MUS','BRB','GRD','ATG','KNA','DMA','LCA','VCT'].includes(c.code)).map(c=><circle key={c.code} cx={c.x} cy={c.y} r={2/Math.sqrt(zoom)} fill={colors.get(c.code)||'#b9b99e'} stroke="#fcf8e9" strokeWidth={0.7/zoom} className="island-target" onClick={e=>select(c.code,e)}><title>{showNames?c.name:''}</title></circle>)}
        {selected&&pin&&<g transform={`translate(${pin.x} ${pin.y}) scale(${1/zoom})`} className="map-pin"><ellipse cy="2" rx="7" ry="2" fill="#73583a" opacity=".25"/><path d="M0 0C-2-5-10-12-10-20a10 10 0 0120 0C10-12 2-5 0 0Z" fill={wrong?'#9c4035':'#b76a45'} stroke="#fff7e5" strokeWidth="2"/><circle cy="-20" r="3" fill="#fff7e5"/>{showNames&&<g><rect x="-65" y="-58" width="130" height="22" rx="4" fill="#faf7ee"/><text y="-43" textAnchor="middle" fontSize="11" fill="#344f4d" fontFamily="system-ui">{country?.name}</text></g>}</g>}
      </g>
      <g className="map-crosshair" stroke="#6e7263" fill="none"><circle cx="540" cy="270" r="8"/><path d="M540 255v9m0 12v9m-15-15h9m12 0h9"/></g>
    </svg>
    {failed&&<div className="map-error">The map could not load. You can still play with the country selector.</div>}
    {active&&<><div className="map-toolbar"><button aria-label="Zoom in" onClick={()=>setView(v=>({...v,zoom:Math.min(7,v.zoom*1.4)}))}><Plus size={18}/></button><button aria-label="Zoom out" onClick={()=>setView(v=>({...v,zoom:Math.max(1,v.zoom/1.4)}))}><Minus size={18}/></button><span/><button aria-label="Reset map view" onClick={()=>setView({zoom:1,pan:{x:0,y:0}})}><LocateFixed size={18}/></button></div><div className="map-hint">{hover&&showNames?countries.find(c=>c.code===hover)?.name:'Scroll to zoom · Drag to explore'}</div></>}
  </div>;
}
