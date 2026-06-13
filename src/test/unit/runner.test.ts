import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

vi.mock("../../git/api", () => ({
  getGitBinaryPath: vi.fn().mockResolvedValue("git")
}));

import { resetGitBinaryCacheForTests, runGit } from "../../git/runner";

describe("runGit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGitBinaryCacheForTests();
    spawnMock.mockImplementation(() => makeProcess("mock output\n", "", 0));
  });

  it("resolves stdout and exit code", async () => {
    const result = await runGit(["log", "--oneline"], "/tmp/repo");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("mock output");
  });

  it("passes cwd and args to spawn", async () => {
    await runGit(["status"], "/my/repo");
    expect(spawnMock).toHaveBeenCalledWith(
      "git",
      ["status"],
      expect.objectContaining({
        cwd: "/my/repo",
        shell: false,
        windowsHide: true
      })
    );
  });

  it("sets GIT_TERMINAL_PROMPT=0", async () => {
    await runGit(["fetch"], "/tmp/repo");
    expect(spawnMock).toHaveBeenCalledWith(
      "git",
      ["fetch"],
      expect.objectContaining({
        env: expect.objectContaining({ GIT_TERMINAL_PROMPT: "0" })
      })
    );
  });
});

function makeProcess(stdout: string, stderr: string, code: number) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = vi.fn();

  setTimeout(() => {
    proc.stdout.write(stdout);
    proc.stderr.write(stderr);
    proc.stdout.end();
    proc.stderr.end();
    proc.emit("close", code);
  }, 0);

  return proc;
}
