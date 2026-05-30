import type { WebhookSubscription } from '../_shared/types.js';

export const onRequestPost: PagesFunction<{ SUBSCRIPTIONS: KVNamespace }> = async (context) => {
  const { request, env } = context;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';

  if (!url) {
    return new Response(JSON.stringify({ error: 'Missing url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const existing = await env.SUBSCRIPTIONS.get('webhooks');
    if (!existing) {
      return new Response(JSON.stringify({ success: true, message: 'Not subscribed' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const subs: WebhookSubscription[] = JSON.parse(existing);
    const filtered = subs.filter(s => s.url !== url);

    if (filtered.length === subs.length) {
      return new Response(JSON.stringify({ success: true, message: 'Not subscribed' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await env.SUBSCRIPTIONS.put('webhooks', JSON.stringify(filtered));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to remove subscription' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
