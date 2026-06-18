import * as http from 'http';
import { EventEmitter } from 'events';

// Wire types live in protocol.ts (shared with the webview bundle). Re-export the ones
// callers have historically imported from here so existing import sites keep working.
export { RelayEnvelope, RelayPayload, RelayOrigin } from './protocol';
import { RelayEnvelope } from './protocol';

export class RelayServer extends EventEmitter {
  private server?: http.Server;

  start(host: string, port: number): void {
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.on('error', (err: NodeJS.ErrnoException) => {
      this.emit('error', err); // EADDRINUSE lands here — see 3.3
    });
    this.server.listen(port, host, () => this.emit('listening', { host, port }));
  }

  stop(): void {
    this.server?.close();
    this.server = undefined;
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    // The PHP client probes this before sending payloads, and the semantics are
    // INVERTED from a normal health check. spatie/ray sets CURLOPT_FAILONERROR and
    // treats the server as available ONLY when this returns 404
    // (curl_errno === CURLE_HTTP_NOT_FOUND, i.e. 22). A 200 yields curl_errno === 0,
    // serverIsAvailable() returns false, and send() drops EVERY payload before POSTing.
    // Must be 404, not 200. (Source of truth: Client::serverIsAvailable() in
    // vendor/spatie/ray/src/Client.php — derive this, don't assume 200-means-healthy.)
    if (req.method === 'GET' && req.url?.startsWith('/_availability_check')) {
      res.writeHead(404).end();
      return;
    }

    // ray()->pause() support — see 3.4. Releasing unconditionally is fine for v1.
    if (req.method === 'GET' && req.url?.startsWith('/locks/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ active: false, stop_execution: false }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        // Respond immediately — the PHP client blocks your app while waiting.
        res.writeHead(200).end();
        try {
          this.emit('envelope', JSON.parse(body) as RelayEnvelope);
        } catch {
          this.emit('parse-error', body);
        }
      });
      return;
    }

    res.writeHead(404).end();
  }
}
