import * as vscode from 'vscode';
import { RelayStore } from './RelayStore';

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
      }
    });
  }

  // extension host → webview
  public post(message: unknown): void {
    this.view?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css')
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <div id="relay-list"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return [...Array(32)].map(() => Math.random().toString(36)[2]).join('');
}
