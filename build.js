const esbuild = require("esbuild");
const path = require("path");

const watch = process.argv.includes("--watch");

const buildOptions = {
	entryPoints: [
		{ in: "src/content/main.ts", out: "content/main" },
		{ in: "src/content/scraper.ts", out: "content/scraper" },
		{ in: "src/background/background.ts", out: "background/background" },
		{ in: "src/popup/popup.ts", out: "popup/popup" },
	],
	bundle: true,
	minify: !watch,
	sourcemap: watch ? "inline" : false,
	outdir: "dist",
	platform: "browser",
	target: ["firefox120"],
	loader: {
		".ts": "ts",
	},
	define: {
		"process.env.NODE_ENV": watch ? '"development"' : '"production"',
	},
};

const fs = require("fs");

async function run() {
	if (watch) {
		let ctx = await esbuild.context(buildOptions);
		await ctx.watch();
		console.log("Watching for changes...");
	} else {
		await esbuild.build(buildOptions);
		console.log("Build complete.");
	}

	// Copy assets
	copyAssets();
}

function copyAssets() {
	const assets = [
		{ src: "manifest.json", dest: "dist/manifest.json" },
		{ src: "src/popup/popup.html", dest: "dist/popup/popup.html" },
		{ src: "src/popup/popup.css", dest: "dist/popup/popup.css" },
		{ src: "styles/injected.css", dest: "dist/styles/injected.css" },
		{ src: "icons", dest: "dist/icons" },
	];

	assets.forEach((asset) => {
		const destDir = path.dirname(asset.dest);
		if (!fs.existsSync(destDir)) {
			fs.mkdirSync(destDir, { recursive: true });
		}

		if (fs.lstatSync(asset.src).isDirectory()) {
			if (!fs.existsSync(asset.dest)) {
				fs.mkdirSync(asset.dest, { recursive: true });
			}
			fs.readdirSync(asset.src).forEach((file) => {
				fs.copyFileSync(
					path.join(asset.src, file),
					path.join(asset.dest, file),
				);
			});
		} else {
			fs.copyFileSync(asset.src, asset.dest);
		}
	});
	console.log("Assets copied.");
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
