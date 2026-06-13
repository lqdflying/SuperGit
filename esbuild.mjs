import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const common = {
  logLevel: "info",
  sourcemap: true,
};

const extensionConfig = {
  ...common,
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node22",
};

const webviewConfig = {
  ...common,
  entryPoints: ["src/webview/main.tsx"],
  bundle: true,
  outfile: "dist/webview/main.js",
  format: "iife",
  jsx: "automatic",
  platform: "browser",
  target: "es2022",
  loader: {
    ".ts": "ts",
    ".tsx": "tsx"
  }
};

const testRunnerConfig = {
  ...common,
  entryPoints: ["src/test/runTest.ts"],
  bundle: true,
  outfile: "dist/test/runTest.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node22",
};

const integrationSuiteConfig = {
  ...common,
  entryPoints: ["src/test/integration/suite/index.ts"],
  bundle: true,
  outfile: "dist/test/suite/index.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node22",
};

if (isWatch) {
  const extensionContext = await esbuild.context(extensionConfig);
  const webviewContext = await esbuild.context(webviewConfig);
  await Promise.all([extensionContext.watch(), webviewContext.watch()]);
  console.log("Watching for changes...");
} else {
  await esbuild.build(extensionConfig);
  await esbuild.build(webviewConfig);
  await esbuild.build(testRunnerConfig);
  await esbuild.build(integrationSuiteConfig);
  console.log("Build complete.");
}
