import gateway, { type GatewayEnv } from '../../gateway/src/index.js';
export { GatewayRateLimiter } from '../../gateway/src/index.js';

export default {
  fetch(request: Request, env: GatewayEnv & { COMPOSE_CONTROL_TOKEN: string }, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (path === '/__compose/payment-jobs' || path === '/__compose/payment-relay') {
      if (request.method !== 'POST' || request.headers.get('X-Compose-Control') !== env.COMPOSE_CONTROL_TOKEN)
        return new Response(null, { status: 404 });
      const paymentPath = path.endsWith('-jobs') ? '/dev/run-provider-worker' : '/dev/run-outbox-relay';
      return env.PAYMENT!.fetch(new Request('https://payment.internal' + paymentPath, { method: 'POST' }));
    }
    return gateway.fetch(request, env, ctx);
  },
};
