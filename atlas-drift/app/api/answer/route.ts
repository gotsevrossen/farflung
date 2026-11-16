import { env } from 'cloudflare:workers';
import { answerExpedition, type Config } from '@/lib/expedition';
export async function POST(request:Request){
  try{
    if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
    if(Number(request.headers.get('content-length')||0)>350000)return Response.json({error:'Request too large.'},{status:413});
    const body=await request.json() as {token?:unknown;country?:unknown};
    if(typeof body.token!=='string'||!(body.country===null||typeof body.country==='string'))return Response.json({error:'Select a country and expedition.'},{status:400});
    return Response.json(await answerExpedition(body.token,body.country,env as Config),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to score this answer.'},{status:400});}
}
