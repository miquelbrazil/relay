// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { RelayViewProvider } from './RelayViewProvider';
import { RelayServer } from './RelayServer';
import { RelayStore } from './RelayStore';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	const maxItems = vscode.workspace.getConfiguration('relayPanel').get('maxItems', 500);
	const store = new RelayStore(maxItems);

	const provider = new RelayViewProvider(context.extensionUri, store);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(RelayViewProvider.viewType, provider)
	);

	// Clear command — surfaced as a title-bar button on the panel (menus.view/title in
	// package.json) and in the command palette. Clearing the store emits 'cleared'.
	context.subscriptions.push(
		vscode.commands.registerCommand('relay.clear', () => store.clear())
	);

	// Forward store mutations to the webview as normalized events. The webview is a
	// dumb renderer; the store (in the extension host) is the source of truth.
	store.on('added',   (item) => provider.post({ type: 'item-added', item }));
	store.on('updated', (item) => provider.post({ type: 'item-updated', item }));
	store.on('removed', (uuid) => provider.post({ type: 'item-removed', uuid }));
	store.on('cleared', ()     => provider.post({ type: 'cleared' }));

	const server = new RelayServer();

	function startFromConfig() {
		const cfg = vscode.workspace.getConfiguration('relayPanel');
		server.stop();
		server.start(cfg.get('host', '127.0.0.1'), cfg.get('port', 23517));
	}

	startFromConfig();

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('relayPanel')) startFromConfig();
		}),
		{ dispose: () => server.stop() }  // clean shutdown on deactivate
	);

	server.on('error', (err) => {
		if (err.code === 'EADDRINUSE') {
			const port = vscode.workspace.getConfiguration('relayPanel').get('port', 23517);
			vscode.window.showWarningMessage(
				`Ray Panel: port ${port} is already in use (Ray.app running?). ` +
				`Quit Ray.app or change relayPanel.port.`
			);
		}
	});

	const channel = vscode.window.createOutputChannel('Ray (raw)');
	server.on('envelope', (env) => {
		channel.appendLine(JSON.stringify(env, null, 2));
		store.ingest(env);
	});
}

// This method is called when your extension is deactivated
export function deactivate() {}
