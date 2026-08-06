/**
 * Local reverse proxy that injects Cloudflare Access service-token headers.
 *
 * WHY THIS EXISTS
 * `strapi transfer` needs to reach https://cms-staging.pornmode.com, which sits behind a
 * Cloudflare Access application. Access is satisfied by two headers (CF-Access-Client-Id /
 * CF-Access-Client-Secret) — exactly what frontend/src/lib/strapi.ts already sends — but the
 * transfer CLI has no flag or env var for custom headers, so it cannot present them and gets a 302
 * to a login page instead.
 *
 * `cloudflared access tcp` does NOT solve this: it opens a WebSocket to the ORIGIN, and a plain
 * HTTP app behind Access does not speak that protocol. Measured against staging it fails with
 * `websocket: bad handshake` and resets every connection.
 *
 * So: listen on localhost, add the two headers, forward to the real host over TLS. Point
 * `strapi transfer --to http://127.0.0.1:<port>/admin` at it.
 *
 * The `upgrade` handling is not optional — the transfer protocol runs over a WebSocket, so a
 * request-only proxy would authenticate the handshake and then stall forever.
 *
 * BINDING. The proxy listens on 127.0.0.1 only. Containers reach it via host.docker.internal,
 * which on Docker Desktop (macOS/Windows) forwards to the host loopback — that is the setup this
 * repo uses. On a LINUX host, `host-gateway` maps to the docker bridge IP instead, which cannot
 * reach a loopback-bound listener; there you would need `bind: '0.0.0.0'` — and should think twice,
 * because a non-loopback bind hands every machine on the network a pre-authenticated (CF-Access-
 * bypassing) path to the staging admin.
 */

import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { URL } from 'node:url';

/** Headers Cloudflare Access accepts from a service token. Mirrors frontend/src/lib/strapi.ts. */
function cfHeaders(id, secret) {
  if (!id || !secret) return {};
  return { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret };
}

/**
 * Start the proxy.
 *
 * @param {object} opts
 * @param {string} opts.target     e.g. https://cms-staging.pornmode.com
 * @param {string} opts.clientId   CF_ACCESS_CLIENT_ID
 * @param {string} opts.clientSecret CF_ACCESS_CLIENT_SECRET
 * @param {number} [opts.port]     0 = pick a free port
 * @param {string} [opts.bind]     listen address — see BINDING note above before changing
 * @param {boolean} [opts.quiet]
 * @returns {Promise<{ port: number, url: string, close: () => Promise<void> }>}
 */
export async function startCfAccessProxy({ target, clientId, clientSecret, port = 0, bind = '127.0.0.1', quiet = false }) {
  if (!target) throw new Error('cf-access-proxy: target is required');
  if (!clientId || !clientSecret) {
    throw new Error('cf-access-proxy: CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are required');
  }
  const t = new URL(target);
  const injected = cfHeaders(clientId, clientSecret);
  const log = (...a) => { if (!quiet) console.error('[cf-proxy]', ...a); };

  const server = http.createServer((req, res) => {
    const headers = { ...req.headers, ...injected, host: t.host };
    // Hop-by-hop headers must not be replayed upstream. `transfer-encoding` matters most:
    // Node has already DECODED a chunked body by the time we pipe it, so forwarding the header
    // would declare chunked framing on a stream that no longer has it. (https.request re-chunks
    // on its own when there is no content-length.)
    for (const h of ['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'proxy-connection']) {
      delete headers[h];
    }

    const upstream = https.request(
      { hostname: t.hostname, port: t.port || 443, path: req.url, method: req.method, headers, servername: t.hostname },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', (e) => {
      log('upstream error:', e.message);
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`cf-access-proxy upstream error: ${e.message}`);
    });
    req.pipe(upstream);
  });

  // WebSocket (and any other) upgrade: replay the handshake over TLS with the CF headers added,
  // then get out of the way and pipe raw bytes both directions.
  server.on('upgrade', (req, clientSocket, head) => {
    const headers = { ...req.headers, ...injected, host: t.host };
    if (process.env.CF_PROXY_DEBUG) {
      // Presence/length only — never the secret values.
      const shape = Object.entries(headers)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v.length : '?'}`)
        .join(' ');
      log(`upgrade ${req.method} ${req.url}`);
      log(`  headers: ${shape}`);
    }
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [k, v] of Object.entries(headers)) {
      for (const one of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${one}`);
    }
    const handshake = `${lines.join('\r\n')}\r\n\r\n`;

    const upstream = tls.connect(
      { host: t.hostname, port: Number(t.port) || 443, servername: t.hostname },
      () => {
        upstream.write(handshake);
        if (head?.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      },
    );
    const bail = (where) => (e) => {
      log(`upgrade ${where} error:`, e.message);
      clientSocket.destroy();
      upstream.destroy();
    };
    upstream.on('error', bail('upstream'));
    clientSocket.on('error', bail('client'));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, bind, resolve);
  });
  const actual = server.address().port;
  log(`listening on http://${bind}:${actual} -> ${t.origin} (CF Access headers injected)`);

  return {
    port: actual,
    url: `http://127.0.0.1:${actual}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

// CLI: node scripts/lib/cf-access-proxy.mjs [--port 8443] [--target <url>]
// pathToFileURL, not string concatenation: a bare `file://${argv[1]}` mismatches whenever the
// path needs percent-encoding (spaces etc.), silently turning the CLI into a no-op.
const { pathToFileURL } = await import('node:url');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { createRequire } = await import('node:module');
  const { dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const _require = createRequire(import.meta.url);
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dotenv = _require('dotenv');
  // Same precedence the sync script uses: scripts/.env first, then backend/.env for the transfer
  // token, then frontend/.env.local — which is where the CF Access service token actually lives
  // today. dotenv does not overwrite already-set vars, so earlier files win.
  dotenv.config({ path: `${__dirname}/../.env`, quiet: true });
  dotenv.config({ path: `${__dirname}/../../backend/.env`, quiet: true });
  dotenv.config({ path: `${__dirname}/../../frontend/.env.local`, quiet: true });

  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    const next = process.argv[i + 1];
    return i !== -1 && next && !next.startsWith('--') ? next : fallback;
  };

  const { port, url } = await startCfAccessProxy({
    target: arg('--target', process.env.STAGING_TRANSFER_URL ?? 'https://cms-staging.pornmode.com'),
    clientId: process.env.CF_ACCESS_CLIENT_ID,
    clientSecret: process.env.CF_ACCESS_CLIENT_SECRET,
    port: Number(arg('--port', 8443)),
  });
  console.log(`${url} (port ${port}) — Ctrl-C to stop`);
  process.on('SIGINT', () => process.exit(0));
}
