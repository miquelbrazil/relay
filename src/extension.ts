// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { RelayViewProvider } from './RelayViewProvider';
import { RelayServer } from './RelayServer';
import { RelayStore } from './RelayStore';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "relay" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('relay.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from relay!');
	});

	context.subscriptions.push(disposable);

	const maxItems = vscode.workspace.getConfiguration('relayPanel').get('maxItems', 500);
	const store = new RelayStore(maxItems);

	const provider = new RelayViewProvider(context.extensionUri, store);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(RelayViewProvider.viewType, provider)
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
