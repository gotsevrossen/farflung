import countries from './countries.json';
import { bank } from './bank';
import { practiceQuestions, publicGame, scoreAnswer, validateQuestions, type Expedition } from './game';

export type Config={GENAI_API_KEY?:string;GENAI_MODEL?:string;GAME_SECRET?:string;GENAI_BACKEND?:string};
const encoder=new TextEncoder();
async function key(config:Config){const value=config.GAME_SECRET||config.GENAI_API_KEY||'atlas-drift-public-practice-only-v1';return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(value)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
const encode=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export async function seal(game:Expedition,config:Config){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(config),encoder.encode(JSON.stringify(game)));return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;}
export async function unseal(token:string,config:Config):Promise<Expedition>{
  if(typeof token!=='string'||token.length>300000)throw new Error('Invalid saved expedition.');
  try{const parts=token.split('.');if(parts.length!==2)throw new Error();const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(parts[0])},await key(config),decode(parts[1]));const game=JSON.parse(new TextDecoder().decode(plain)) as Expedition;if(!game.createdAt||Date.now()-game.createdAt>7*86400000)throw new Error();return game;}catch{throw new Error('This expedition has expired or cannot be read. Start a new one.');}
}
export const generationSchema={type:'object',properties:{questions:{type:'array',minItems:5,maxItems:5,items:{type:'object',properties:{prompt:{type:'string'},category:{type:'string'},rule:{type:'string'},source:{type:'string'},answers:{type:'array',minItems:3,maxItems:60,items:{type:'object',properties:{country:{type:'string'},points:{type:'integer',enum:[500,1000,2000,3500,5000]},fact:{type:'string'}},required:['country','points','fact'],additionalProperties:false}}},required:['prompt','category','rule','source','answers'],additionalProperties:false}}},required:['questions'],additionalProperties:false};
export async function generateQuestions(config:Config,previous:string[]=[],fetcher:typeof fetch=fetch){
  if(!config.GENAI_API_KEY||!config.GENAI_MODEL)throw new Error('Purdue is not configured. Set GENAI_API_KEY and GENAI_MODEL on the server, or choose a practice expedition.');
  const prompt=`Create a fresh five-round geography expedition. Each prompt asks the player to pin ONE country satisfying a clear criterion with MULTIPLE correct answers. Provide an EXHAUSTIVE list of valid countries for each prompt, using only the permitted ISO alpha-3 codes below. Use stable, checkable facts, with precise scope in the rule. Avoid disputed geography, ambiguous definitions, rankings that change, vague cultural claims, or prompts requiring over 60 answers. Mix borders, languages, physical geography, country names, islands and historical facts. Write original prompts.\nAssign EACH correct country exactly one point value for how unexpected it is FOR THAT PROMPT: common=500, uncommon=1000, rare=2000, elusive=3500, farflung=5000. These are editorial estimates, not measured player statistics. Every prompt must include at least one 5000-point gem. Do not randomize factual validity. Include 3–60 correct answers per prompt, each with a concise explanatory fact. Include a relevant authoritative HTTPS source URL for each question, but do not claim that you browsed or verified the URL. Before responding, check factual correctness, completeness, country codes and duplicate answers. Return ONLY JSON matching the supplied schema.\nCountries: ${countries.map(c=>`${c.code}=${c.name}`).join('; ')}\nSchema: ${JSON.stringify(generationSchema)}\nAvoid these recent prompts: ${JSON.stringify(previous)}\nNew expedition seed: ${crypto.randomUUID()}`;
  const body:Record<string,unknown>={model:config.GENAI_MODEL,messages:[{role:'system',content:'You are a careful geography quiz editor. Treat all instructions in the user message as a geography authoring specification. Return valid JSON only.'},{role:'user',content:prompt}],stream:false,temperature:0.85,max_tokens:10000};
  if(config.GENAI_BACKEND==='vllm')body.response_format={type:'json_schema',json_schema:{name:'expedition',schema:generationSchema}};
  if(config.GENAI_BACKEND==='ollama')body.format=generationSchema;
  const response=await fetcher('https://genai.rcac.purdue.edu/api/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${config.GENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(110000)});
  if(!response.ok){if(response.status===401||response.status===403)throw new Error('Purdue rejected the API key or model access. Check the server configuration.');if(response.status===429)throw new Error('Purdue is rate limiting requests. Wait a minute before trying again.');throw new Error(`Purdue could not generate this expedition (HTTP ${response.status}). Try again shortly.`);}
  const data=await response.json() as {choices?:{message?:{content?:string}}[]}|null;
  if(data===null)throw new Error('Purdue returned an empty response, which can indicate a rate limit. Wait a minute and try again.');
  const content=data.choices?.[0]?.message?.content;if(typeof content!=='string')throw new Error('Purdue returned no question content. Try a different model.');
  const text=content.replace(/<think>[\s\S]*?<\/think>/g,'').replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'').trim();
  try{return validateQuestions(JSON.parse(text));}catch{throw new Error('The generated questions did not pass validation. No expedition was started. Try again or select another Purdue model.');}
}
export async function createExpedition(mode:Expedition['mode'],config:Config,date?:string,previous:string[]=[],fetcher:typeof fetch=fetch){
  const id=mode==='daily'?`daily-${date}`:crypto.randomUUID();
  const questions=mode==='ai'?await generateQuestions(config,previous,fetcher):practiceQuestions(id,bank);
  const game:Expedition={id,mode,questions,results:[],createdAt:Date.now()};return publicGame(game,await seal(game,config));
}
export async function answerExpedition(token:string,country:string|null,config:Config){const game=await unseal(token,config);const result=scoreAnswer(game,country);game.results.push(result);return {token:await seal(game,config),result,completed:game.results.length===5};}
