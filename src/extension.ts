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

	// Status bar item: at-a-glance server state, click to toggle. Turns the EADDRINUSE
	// case from a mystery into a glance (guide 3.3 / 6).
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBar.command = 'relay.toggleServer';
	context.subscriptions.push(statusBar);

	type ServerState = 'listening' | 'stopped' | 'busy';
	function setStatus(state: ServerState) {
		const port = vscode.workspace.getConfiguration('relayPanel').get('port', 23517);
		switch (state) {
			case 'listening':
				statusBar.text = `$(broadcast) Relay :${port}`;
				statusBar.tooltip = 'Relay is listening — click to stop';
				statusBar.backgroundColor = undefined;
				break;
			case 'stopped':
				statusBar.text = `$(debug-disconnect) Relay (off)`;
				statusBar.tooltip = 'Relay is stopped — click to start';
				statusBar.backgroundColor = undefined;
				break;
			case 'busy':
				statusBar.text = `$(error) Relay :${port} busy`;
				statusBar.tooltip = `Port ${port} is in use (Ray.app running?) — click to retry`;
				statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
				break;
		}
		statusBar.show();
	}

	let running = false;

	function startFromConfig() {
		const cfg = vscode.workspace.getConfiguration('relayPanel');
		server.stop();
		server.start(cfg.get('host', '127.0.0.1'), cfg.get('port', 23517));
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('relay.toggleServer', () => {
			if (running) {
				server.stop();
				running = false;
				setStatus('stopped');
			} else {
				startFromConfig();
			}
		})
	);

	server.on('listening', () => {
		running = true;
		setStatus('listening');
	});

	startFromConfig();

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('relayPanel')) startFromConfig();
		}),
		{ dispose: () => server.stop() }  // clean shutdown on deactivate
	);

	server.on('error', (err) => {
		if (err.code === 'EADDRINUSE') {
			running = false;
			setStatus('busy');
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
