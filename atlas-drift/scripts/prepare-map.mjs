import fs from 'node:fs';
const topology = JSON.parse(fs.readFileSync('public/world-topology.json', 'utf8'));
const source = JSON.parse(fs.readFileSync('public/country-source.json', 'utf8'));
const nations = source.filter(c => c.unMember || ['VAT', 'PSE'].includes(c.cca3));
const parents = {GRL:'DNK',FRO:'DNK',GUF:'FRA',GLP:'FRA',MTQ:'FRA',REU:'FRA',MYT:'FRA',NCL:'FRA',PYF:'FRA',SPM:'FRA',WLF:'FRA',ATF:'FRA',BLM:'FRA',MAF:'FRA',GUM:'USA',PRI:'USA',ASM:'USA',VIR:'USA',MNP:'USA',AIA:'GBR',BMU:'GBR',CYM:'GBR',FLK:'GBR',GIB:'GBR',MSR:'GBR',SHN:'GBR',TCA:'GBR',VGB:'GBR',SGS:'GBR',PCN:'GBR',ABW:'NLD',CUW:'NLD',SXM:'NLD',BES:'NLD',HKG:'CHN',MAC:'CHN',CXR:'AUS',CCK:'AUS',NFK:'AUS',SJM:'NOR',TKL:'NZL'};
const codes = new Set(nations.map(c=>c.cca3));
const lookup = new Map(source.map(c=>[String(c.ccn3), c]));
const tx=topology.transform;
const arcs=topology.arcs.map(arc=>{let x=0,y=0;return arc.map(p=>{x+=p[0];y+=p[1];return [x*tx.scale[0]+tx.translate[0],y*tx.scale[1]+tx.translate[1]];});});
const project=([lon,lat])=>[(lon+180)*3,(90-lat)*3];
/* Split a projected ring at the antimeridian (x jumps > 500 px). Each crossing
   inserts edge points at x=0/1080 so the ring becomes multiple closed sub-paths
   instead of one path with a horizontal line across the entire map. */
function ring(indices){
  const coordinates=[];
  for(const index of indices){let points=arcs[index<0?~index:index];if(index<0)points=[...points].reverse();coordinates.push(...points.slice(coordinates.length?1:0));}
  const projected=coordinates.map(p=>project(p));
  const W=1080,T=500;
  const parts=[];let cur=[`M${projected[0].map(v=>v.toFixed(2)).join(',')}`];
  for(let i=1;i<projected.length;i++){
    const [px,py]=projected[i-1],[cx,cy]=projected[i];
    if(Math.abs(cx-px)>T){
      const right=px>W/2;const dAcross=right?(W-px)+cx:px+(W-cx);const t=dAcross===0?0:right?(W-px)/dAcross:px/dAcross;const ey=py+t*(cy-py);
      cur.push(`L${right?W:0},${ey.toFixed(2)}`);cur.push('Z');parts.push(cur.join(''));
      cur=[`M${right?0:W},${ey.toFixed(2)}`];cur.push(`L${cx.toFixed(2)},${cy.toFixed(2)}`);
    }else{cur.push(`L${cx.toFixed(2)},${cy.toFixed(2)}`);}
  }
  cur.push('Z');parts.push(cur.join(''));
  /* The ring is closed, so its last piece continues into its first. Join them; closing each
     with its own Z draws a wedge across the map (seen on Russia). */
  if(parts.length>1){const first=parts.shift();const last=parts.pop();parts.unshift(last.replace(/Z$/,'')+first.replace(/^M/,'L'));}
  return parts.join('');
}
const shapes=[];
for(const g of topology.objects.countries.geometries){const c=lookup.get(String(g.id)); if(!c)continue; const code=codes.has(c.cca3)?c.cca3:parents[c.cca3];const polys=g.type==='Polygon'?[g.arcs]:g.arcs;shapes.push({code:code||null,name:c.name.common,path:polys.map(poly=>poly.map(ring).join('')).join('')});}
const countries=nations.map(c=>({code:c.cca3,name:c.name.common,flag:c.flag,x:project([c.latlng[1],c.latlng[0]])[0],y:project([c.latlng[1],c.latlng[0]])[1],aliases:[c.name.official,...Object.values(c.altSpellings||{})]})).sort((a,b)=>a.name.localeCompare(b.name));
fs.writeFileSync('public/world.json',JSON.stringify(shapes));
fs.writeFileSync('lib/countries.json',JSON.stringify(countries,null,2));
fs.unlinkSync('public/world-topology.json');fs.unlinkSync('public/country-source.json');
console.log(`Prepared ${countries.length} countries and ${shapes.length} map regions.`);
