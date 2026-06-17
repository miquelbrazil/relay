import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RelayStore } from './RelayStore';

interface Origin {
  file?: string;
  line_number?: number;
  hostname?: string;
}

export class RelayViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'relayPanel.view';
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: RelayStore,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    // webview → extension host
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'ready') {
        // The webview's DOM is destroyed whenever the panel is hidden, so on every
        // (re)load it asks us to replay the full history held in the extension host.
        this.post({ type: 'replay', items: this.store.snapshot() });
      } else if (msg.type === 'open-origin') {
        this.openOrigin(msg.origin);
      }
    });
  }

  // Click-to-jump: resolve the (possibly container-side) origin to a local file and reveal it.
  private async openOrigin(origin: Origin): Promise<void> {
    if (!origin?.file) {
      return;
    }
    const file = this.resolveOrigin(origin);
    if (!file) {
      vscode.window.showWarningMessage(
        `Relay: couldn't locate ${origin.file} on disk. ` +
        `Open the project folder, or add a relayPanel.pathMappings entry.`
      );
      return;
    }
    try {
      const doc = await vscode.workspace.openTextDocument(file);
      const line = Math.max(0, (origin.line_number ?? 1) - 1);
      await vscode.window.showTextDocument(doc, {
        selection: new vscode.Range(line, 0, line, 0),
        preview: true,
      });
    } catch (err) {
      vscode.window.showWarningMessage(
        `Relay: couldn't open ${file} — ${err instanceof Error ? err.message : String(err)}.`
      );
    }
  }

  // Resolution precedence (evaluated per click, not per payload):
  //   1. Explicit relayPanel.pathMappings override (longest remote prefix wins).
  //   2. origin.file as-is if it already exists on disk (the configured ray.php case).
  //   3. Suffix-resolve against the window's workspace folders (zero-config fallback).
  // Returns undefined if nothing resolves, so the caller can warn instead of guessing.
  private resolveOrigin(origin: Origin): string | undefined {
    const raw = origin.file!;

    const overridden = this.applyPathMappings(raw);
    if (overridden) {
      return overridden;
    }
    if (this.fileExists(raw)) {
      return raw;
    }
    return this.suffixResolve(raw, origin.hostname);
  }

  // 1. Explicit override. Returns the rewritten path if a mapping matched, else undefined.
  private applyPathMappings(file: string): string | undefined {
    const mappings = vscode.workspace
      .getConfiguration('relayPanel')
      .get<Array<{ remote: string; local: string }>>('pathMappings', []);
    const match = mappings
      .filter((m) => m.remote && file.startsWith(m.remote))
      .sort((a, b) => b.remote.length - a.remote.length)[0];
    return match ? match.local + file.slice(match.remote.length) : undefined;
  }

  // 3. Find the file by its tail under an open workspace folder. We strip leading path
  // segments until <folder>/<tail> exists, preferring the longest matched tail (which
  // naturally selects the right project over a coincidental basename match elsewhere).
  // Ties between equally-deep matches are broken by origin.hostname ~ folder name.
  private suffixResolve(file: string, hostname?: string): string | undefined {
    if (!vscode.workspace
      .getConfiguration('relayPanel')
      .get<boolean>('resolveOriginsFromWorkspace', true)) {
      return undefined;
    }
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) {
      return undefined;
    }

    const segments = file.split('/').filter(Boolean);
    const candidates: Array<{ path: string; matched: number; folder: vscode.WorkspaceFolder }> = [];

    for (const folder of folders) {
      const root = folder.uri.fsPath;
      // Ascending i = shorter tail, so the first hit is this folder's longest match.
      for (let i = 0; i < segments.length; i++) {
        const candidate = path.join(root, ...segments.slice(i));
        if (this.fileExists(candidate)) {
          candidates.push({ path: candidate, matched: segments.length - i, folder });
          break;
        }
      }
    }
    if (!candidates.length) {
      return undefined;
    }

    const maxMatched = Math.max(...candidates.map((c) => c.matched));
    const top = candidates.filter((c) => c.matched === maxMatched);
    if (top.length === 1) {
      return top[0].path;
    }

    // Ambiguous (same relative path in multiple folders) — disambiguate by hostname,
    // which is distinctive per Lando project. Match on exact alphanumeric tokens, not
    // substrings: a generic basename like "app" must not match "appserver" inside a
    // hostname. We also consider the parent dir name, since project roots are often
    // ".../<project>/app". Only a single unambiguous winner counts; otherwise refuse
    // rather than confidently open the wrong file.
    if (hostname) {
      const hostTokens = new Set(hostname.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
      const byHost = top.filter((c) => {
        const fp = c.folder.uri.fsPath;
        return [path.basename(fp), path.basename(path.dirname(fp))]
          .some((name) => hostTokens.has(name.toLowerCase()));
      });
      if (byHost.length === 1) {
        return byHost[0].path;
      }
    }
    console.warn(
      `Relay: ambiguous origin "${file}" matches ${top.length} workspace folders; ` +
      `add a relayPanel.pathMappings entry to disambiguate.`
    );
    return undefined;
  }

  private fileExists(p: string): boolean {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }

  // extension host → webview
  public post(message: unknown): void {
    this.view?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const asset = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', file));

    const mainJs = asset('main.js');
    const mainCss = asset('main.css');
    const sfDumpJs = asset('sf-dump.js');     // VarDumper's Sfdump (vendored)
    const sfDumpCss = asset('sf-dump.css');   // VarDumper's dump styles (vendored)
    const purifyJs = asset('purify.min.js');  // DOMPurify (vendored)

    const colorStyle = vscode.workspace
      .getConfiguration('relayPanel')
      .get<string>('colorStyle', 'border');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src ${webview.cspSource} data:;
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';">
  <link href="${sfDumpCss}" rel="stylesheet">
  <link href="${mainCss}" rel="stylesheet">
</head>
<body data-color-style="${colorStyle}">
  <div id="relay-toolbar"></div>
  <div id="relay-list"></div>
  <script nonce="${nonce}" src="${purifyJs}"></script>
  <script nonce="${nonce}" src="${sfDumpJs}"></script>
  <script nonce="${nonce}" src="${mainJs}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return [...Array(32)].map(() => Math.random().toString(36)[2]).join('');
}
