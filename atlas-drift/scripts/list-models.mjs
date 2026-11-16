import { readFile } from 'node:fs/promises';
let apiKey=process.env.GENAI_API_KEY;
if(!apiKey){try{const text=await readFile('.dev.vars','utf8');const line=text.split(/\r?\n/).find(s=>/^\s*GENAI_API_KEY\s*=/.test(s));apiKey=line?.slice(line.indexOf('=')+1).trim().replace(/^(['"])(.*)\1$/,'$2');}catch{}}
if(!apiKey){console.error('Set GENAI_API_KEY in .dev.vars or your environment first.');process.exitCode=1;}else{
 const response=await fetch('https://genai.rcac.purdue.edu/api/models',{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(30000)});
 if(!response.ok){console.error(`Purdue model discovery failed (HTTP ${response.status}).`);process.exitCode=1;}else{
  const value=await response.json();if(value===null){console.error('Purdue returned no models. Wait a minute and try again.');process.exitCode=1;}else{
   const models=Array.isArray(value)?value:(value.data||value.models||[]);for(const model of models)console.log(`${model.id||model.model||model.name}${model.name&&model.name!==model.id?' — '+model.name:''}`);
  }
 }
}
