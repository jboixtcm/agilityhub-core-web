// Evidence-only HTTPS host/proxy harness. No application code is changed.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:https';
import { request } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';

export function tlsFixture() {
  const directory = '/tmp/agilityhub-functional-https';
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const key = directory + '/key.pem';
  const cert = directory + '/cert.pem';
  if (!existsSync(cert)) execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-days', '2', '-keyout', key, '-out', cert, '-subj', '/CN=AgilityHub local functional fixture',
    '-addext', 'subjectAltName=DNS:app.example.test,DNS:admin.example.test,DNS:id.example.test'],
    { stdio: 'ignore' });
  const publicKey = new X509Certificate(readFileSync(cert)).publicKey.export({ type: 'spki', format: 'der' });
  return { key, cert, spki: createHash('sha256').update(publicKey).digest('base64') };
}

if (process.argv.includes('--serve')) {
  const tls = tlsFixture();
  const roots = new Map([['app.example.test', 'apps/clubs/dist'],
    ['admin.example.test', 'apps/clubs-admin/dist'], ['id.example.test', 'apps/id/dist']]);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.fbx': 'application/octet-stream' };
  const evidence = process.env.CORE_EVIDENCE_DIRECTORY;
  mkdirSync(evidence, { recursive: true });
  createServer({ key: readFileSync(tls.key), cert: readFileSync(tls.cert) }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const root = roots.get(host);
    if (!root) { res.writeHead(421); res.end(); return; }
    const path = new URL(req.url, 'https://' + host).pathname;
    if (/^\/(?:api|oauth2|connect)\/|^\/\.well-known\//.test(path)) {
      // Ignore inbound forwarding claims. The sole trusted fixture peer sets them from this TLS socket.
      const headers = { ...req.headers, host };
      for (const name of Object.keys(headers)) if (name === 'forwarded' || name.startsWith('x-forwarded-')) delete headers[name];
      headers['x-forwarded-proto'] = 'https';
      headers['x-forwarded-for'] = req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? '127.0.0.1';
      headers['x-forwarded-host'] = host;
      const upstream = request(new URL(req.url, process.env.CORE_URL), {
        method: req.method, headers,
      }, answer => {
        appendFileSync(evidence + '/https-proxy-calls.jsonl', JSON.stringify({
          host, forwardedHost: host, forwardedProto: 'https', path, method: req.method, status: answer.statusCode,
          cookies: (answer.headers['set-cookie'] ?? []).map(cookie => {
            const [pair, ...attributes] = cookie.split(';');
            return { name: pair.split('=')[0], attributes: attributes.map(value => value.trim()) };
          }),
        }) + '\n');
        res.writeHead(answer.statusCode, answer.headers); answer.pipe(res);
      });
      upstream.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(upstream); return;
    }
    const base = resolve(root);
    let file = resolve(base, '.' + decodeURIComponent(path));
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(400); res.end(); return; }
    if (!existsSync(file) || !statSync(file).isFile()) {
      if (extname(path)) { res.writeHead(404); res.end(); return; }
      file = resolve(base, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=60' });
    res.end(readFileSync(file));
  }).listen(443, '0.0.0.0', () => console.log('HTTPS compiled SPA fixture ready: three separate hosts'));
}
