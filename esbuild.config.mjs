import esbuild from 'esbuild';
import process from 'process';

const production = process.argv[2] === 'production';

const context = await esbuild.context({
	banner: {
		js: '/* Mermaid Fullscreen - built bundle */',
	},
	entryPoints: ['main.ts'],
	bundle: true,
	external: ['obsidian', 'electron'],
	format: 'cjs',
	target: 'es2018',
	logLevel: 'info',
	sourcemap: production ? false : 'inline',
	treeShaking: true,
	outfile: 'main.js',
});

if (production) {
	await context.rebuild();
	await context.dispose();
	process.exit(0);
} else {
	await context.watch();
}
