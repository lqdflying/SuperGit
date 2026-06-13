import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  process.env.ELECTRON_NO_SANDBOX = "1";

  const extensionDevelopmentPath = path.resolve(__dirname, "../..");
  const extensionTestsPath = path.resolve(__dirname, "suite");

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ["--disable-extensions", "--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", extensionDevelopmentPath]
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
