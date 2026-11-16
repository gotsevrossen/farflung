declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GENAI_API_KEY?: string;
    GENAI_MODEL?: string;
    GENAI_BACKEND?: string;
    GAME_SECRET?: string;
  }
}
