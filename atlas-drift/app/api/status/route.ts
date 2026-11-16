import { env } from 'cloudflare:workers';
import type { Config } from '@/lib/expedition';
export async function GET(){const config=env as Config;return Response.json({connected:!!(config.GENAI_API_KEY&&config.GENAI_MODEL),model:config.GENAI_MODEL||null,backend:config.GENAI_BACKEND||'auto'},{headers:{'Cache-Control':'no-store'}});}
