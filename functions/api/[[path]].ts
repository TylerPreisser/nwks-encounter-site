// functions/api/[[path]].ts — Cloudflare Pages Function catch-all for /api/*

import { app } from '../_api/app';
import type { Env } from '../_api/app';

/**
 * Pages Function catch-all: delegates every /api/* request to the Hono app.
 * Pages passes `context.env` as the bindings; Hono receives them as `c.env`.
 */
export const onRequest: PagesFunction<Env> = (context) => {
  return app.fetch(context.request, context.env, context);
};
