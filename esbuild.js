const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	// Two entry points because there are two runtimes: the extension host (Node) and the
	// webview (a sandboxed browser iframe). Their build options are mutually exclusive
	// (node/cjs/external:vscode vs browser/iife+DOM) and they are delivered separately, so
	// they cannot share one bundle — only shared SOURCE (src/protocol.ts), which esbuild
	// inlines into each output. See docs/architecture/renderer-strategy.md.
	const host = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});

	const webview = await esbuild.context({
		entryPoints: [
			'media/src/main.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		target: ['es2022'],
		outfile: 'media/main.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});

	const contexts = [host, webview];
	if (watch) {
		await Promise.all(contexts.map((c) => c.watch()));
	} else {
		await Promise.all(contexts.map((c) => c.rebuild()));
		await Promise.all(contexts.map((c) => c.dispose()));
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
