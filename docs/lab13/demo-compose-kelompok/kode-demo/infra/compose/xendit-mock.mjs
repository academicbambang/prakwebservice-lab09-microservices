import { createServer } from 'node:http';

const invoices = new Map();
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
    if (url.pathname === '/v2/invoices') {
      if (req.method === 'GET') {
        return json(res, 200, [...invoices.values()].map(entry => entry.invoice)
          .filter(invoice => invoice.external_id === url.searchParams.get('external_id')));
      }
      if (req.method === 'POST') {
        const secret = Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString().slice(0, -1);
        if (!/^[a-f0-9]{48}$/.test(secret)) return json(res, 401, { error: 'invalid demo key' });
        const payload = await new Response(req).json();
        const { external_id, amount } = payload;
        if (!/^[a-f0-9-]{36}$/i.test(external_id) || !Number.isSafeInteger(amount) || amount <= 0)
          return json(res, 400, { error: 'invalid invoice' });
        const id = 'demo-' + external_id;
        const invoice = { id, external_id, amount, currency: 'IDR', status: 'PENDING',
          invoice_url: 'http://127.0.0.1:3100/demo/invoices/' + id };
        if (!invoices.has(id)) invoices.set(id, { invoice, callbackToken: secret });
        return json(res, 200, invoices.get(id).invoice);
      }
    }
    const match = /^\/(v2\/invoices|demo\/invoices)\/(demo-[a-f0-9-]{36})(\/expire!)?$/.exec(url.pathname);
    const entry = match && invoices.get(match[2]);
    if (!entry) return json(res, 404, { error: 'not found' });
    const { invoice, callbackToken } = entry;
    if (match[1] === 'v2/invoices') {
      if (req.method === 'GET') return json(res, 200, invoice);
      if (req.method === 'POST' && match[3]) { invoice.status = 'EXPIRED'; return json(res, 200, invoice); }
    }
    if (match[1] === 'demo/invoices' && !match[3]) {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><html lang="id"><meta charset="utf-8"><title>Invoice demo</title>
          <main><h1>Invoice demo lokal</h1><p>Rp ${invoice.amount} · ${invoice.status}</p><form method="post">
          <button>Simulasikan pembayaran</button></form></main></html>`);
      }
      if (req.method === 'POST') {
        if (invoice.status === 'EXPIRED') return json(res, 409, { error: 'invoice expired' });
        invoice.status = 'PAID';
        invoice.paid_amount = invoice.amount;
        invoice.paid_at = new Date().toISOString();
        const response = await fetch('http://gateway:3000/webhooks/xendit', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Callback-Token': callbackToken },
          body: JSON.stringify(invoice), signal: AbortSignal.timeout(5000),
        });
        return json(res, response.status, await response.json());
      }
    }
    return json(res, 405, { error: 'method not allowed' });
  } catch {
    return json(res, 500, { error: 'demo invoice failed' });
  }
}).listen(3100, '0.0.0.0');
