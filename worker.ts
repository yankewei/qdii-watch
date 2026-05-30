import { onRequestPost as notify } from './functions/api/notify.js';
import { onRequestPost as subscribe } from './functions/api/subscribe.js';
import { onRequestPost as unsubscribe } from './functions/api/unsubscribe.js';

interface Env {
  ASSETS: Fetcher;
  NOTIFY_TOKEN: string;
  SUBSCRIPTIONS: KVNamespace;
  TURNSTILE_SECRET: string;
}

function invoke(
  handler: PagesFunction<Env>,
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> | Response {
  return handler({
    request,
    env,
    params: {},
    data: {},
    functionPath: new URL(request.url).pathname,
    waitUntil: ctx.waitUntil.bind(ctx),
    passThroughOnException: ctx.passThroughOnException.bind(ctx),
    next: () => env.ASSETS.fetch(request),
  });
}

export default {
  fetch(request, env, ctx) {
    if (request.method === 'POST') {
      const pathname = new URL(request.url).pathname;

      if (pathname === '/api/subscribe') {
        return invoke(subscribe, request, env, ctx);
      }
      if (pathname === '/api/unsubscribe') {
        return invoke(unsubscribe, request, env, ctx);
      }
      if (pathname === '/api/notify') {
        return invoke(notify, request, env, ctx);
      }
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
