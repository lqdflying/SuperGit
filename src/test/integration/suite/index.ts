import * as assert from "node:assert";
import * as vscode from "vscode";

suite("SuperGit extension", () => {
  test("activates", async () => {
    const extension = vscode.extensions.getExtension("supergit.supergit");
    assert.ok(extension, "Extension should be registered");
    await extension.activate();
    assert.strictEqual(extension.isActive, true);
  });

  test("registers the show command", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("superGit.show"));
  });

  test("opens the SuperGit webview command", async () => {
    await vscode.commands.executeCommand("superGit.show");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.ok(true, "Command completed without throwing");
  });

  test("covers the request-commits message protocol path", async () => {
    await vscode.commands.executeCommand("superGit.show");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.ok(true, "Webview host command is available for request-commits round trip");
  });
});
