// functions/_api/app.ts — shared Env type for Cloudflare Workers bindings

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  PHOTOS: R2Bucket;
  SESSION_SECRET: string;
  EMAIL_ENABLED: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  RESEND_API_KEY: string;
}
