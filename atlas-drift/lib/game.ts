import countries from './countries.json';

export const TIERS = [
  {name:'Common', points:500, color:'#839484'},
  {name:'Uncommon', points:1000, color:'#48868a'},
  {name:'Rare', points:2000, color:'#5474a5'},
  {name:'Elusive', points:3500, color:'#9369a1'},
  {name:'Farflung', points:5000, color:'#c28b36'},
] as const;
export type Answer = {country:string; points:number; fact:string};
export type Question = {id:string; prompt:string; category:string; rule:string; source:string; answers:Answer[]};
export type Result = {question:string; country:string|null; points:number; fact:string; answers:Answer[]; source:string};
export type Expedition = {id:string; mode:'practice'|'daily'|'ai'; questions:Question[]; results:Result[]; createdAt:number};
export type PublicGame = {id:string; mode:Expedition['mode']; token:string; questions:Omit<Question,'answers'>[]; results:Result[]};
const countryCodes=new Set(countries.map(c=>c.code));

export function validateQuestions(value:unknown):Question[] {
  if(!value || typeof value!=='object' || !('questions' in value) || !Array.isArray(value.questions) || value.questions.length!==5) throw new Error('An expedition must contain exactly five questions.');
  const prompts=new Set<string>();
  return value.questions.map((q:unknown,i:number)=>{
    if(!q || typeof q!=='object')throw new Error('Invalid question.');
    const v=q as Record<string,unknown>;
    for(const key of ['prompt','category','rule','source'])if(typeof v[key]!=='string'||!(v[key] as string).trim()||(v[key] as string).length>(key==='source'?1000:650))throw new Error(`Invalid question ${key}.`);
    if(!/^https:\/\//.test(v.source as string))throw new Error('A source URL is required.');
    const normalized=(v.prompt as string).trim().toLowerCase();if(prompts.has(normalized))throw new Error('Repeated prompt.');prompts.add(normalized);
    if(!Array.isArray(v.answers)||v.answers.length<3||v.answers.length>60)throw new Error('Each question needs 3–60 accepted countries.');
    const seen=new Set<string>();
    const answers=v.answers.map((a:unknown)=>{
      if(!a||typeof a!=='object')throw new Error('Invalid answer.');
      const answer=a as Answer;
      if(!countryCodes.has(answer.country)||seen.has(answer.country))throw new Error('Unknown or duplicated country.');
      if(!TIERS.some(t=>t.points===answer.points))throw new Error('Invalid point value.');
      if(typeof answer.fact!=='string'||answer.fact.length<8||answer.fact.length>800)throw new Error('An answer needs a short factual explanation.');
      seen.add(answer.country);return {country:answer.country,points:answer.points,fact:answer.fact};
    });
    if(!answers.some(a=>a.points===5000))throw new Error('Every question needs a Farflung answer.');
    return {id:`q${i+1}`,prompt:(v.prompt as string).trim(),category:v.category as string,rule:v.rule as string,source:v.source as string,answers};
  });
}

export function scoreAnswer(game:Expedition,country:string|null):Result {
  if(game.results.length>=game.questions.length)throw new Error('This expedition is already complete.');
  if(country!==null&&!countryCodes.has(country))throw new Error('Select a recognized country.');
  const question=game.questions[game.results.length];
  const match=question.answers.find(a=>a.country===country);
  return {question:question.prompt,country,points:match?.points||0,fact:match?.fact||(country?'This country does not meet the prompt’s stated rule.':'No country was pinned before the round ended.'),answers:question.answers,source:question.source};
}

export function publicGame(game:Expedition,token:string):PublicGame {
  return {id:game.id,mode:game.mode,token,questions:game.questions.map(({answers:_,...q})=>q),results:game.results};
}

function seedNumber(seed:string){let n=2166136261;for(const c of seed)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
export function practiceQuestions(seed:string,bank:Question[]):Question[]{
  let n=seedNumber(seed);const random=()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};
  const shuffled=[...bank];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}return shuffled.slice(0,5);
}
