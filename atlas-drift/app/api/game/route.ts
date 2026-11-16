import { env } from 'cloudflare:workers';
import { createExpedition, type Config } from '@/lib/expedition';
const recent=new Map<string,number>();
export async function POST(request:Request){
  try{
    if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
    if(Number(request.headers.get('content-length')||0)>10000)return Response.json({error:'Request too large.'},{status:413});
    const body=await request.json() as Record<string,unknown>;
    if(!['practice','daily','ai'].includes(String(body.mode)))return Response.json({error:'Choose an expedition mode.'},{status:400});
    if(body.mode==='daily'&&(typeof body.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(body.date)))return Response.json({error:'A daily expedition needs a date.'},{status:400});
    const user=request.headers.get('oai-authenticated-user-id')||request.headers.get('cf-connecting-ip')||'local';
    if(body.mode==='ai'){
      const now=Date.now();if((recent.get(user)||0)>now-15000)return Response.json({error:'Wait a few seconds before generating another expedition.'},{status:429});
      if(recent.size>1000)for(const [key,time]of recent)if(time<now-60000)recent.delete(key);
      recent.set(user,now);
    }
    const previous=Array.isArray(body.previous)?body.previous.filter(v=>typeof v==='string').slice(-10).map(s=>String(s).slice(0,650)):[];
    return Response.json(await createExpedition(body.mode as 'practice'|'daily'|'ai',env as Config,typeof body.date==='string'?body.date:undefined,previous),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to create an expedition.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
