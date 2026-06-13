import { spawn } from "node:child_process";
import { getGitBinaryPath } from "./api";
import { debug, error as logError } from "../logger";

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

let cachedBinaryPath: string | null = null;

async function getBinary(): Promise<string> {
  cachedBinaryPath ??= await getGitBinaryPath();
  return cachedBinaryPath;
}

export function resetGitBinaryCacheForTests(): void {
  cachedBinaryPath = null;
}

export async function runGit(
  args: string[],
  cwd: string,
  options?: { timeout?: number }
): Promise<GitResult> {
  const gitPath = await getBinary();
  const timeout = options?.timeout ?? 30_000;
  debug("running git command", { cwd, gitPath, args: redactGitArgs(args), timeout });

  return new Promise((resolve, reject) => {
    const child = spawn(gitPath, args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0"
      },
      shell: false,
      windowsHide: true
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeout);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("close", (code) => {
      clearTimeout(timer);
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode: timedOut ? 124 : code ?? 1,
        timedOut
      };
      debug("git command completed", {
        cwd,
        args: redactGitArgs(args),
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stdoutLength: result.stdout.length,
        stderr: result.stderr.trim().slice(0, 500)
      });
      resolve(result);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      logError("git spawn failed", { cwd, args: redactGitArgs(args), message: error.message });
      reject(new Error(`Failed to spawn git: ${error.message}`));
    });
  });
}

function redactGitArgs(args: string[]): string[] {
  return args.map((arg) => {
    if (/token|password|credential/i.test(arg)) {
      return "<redacted>";
    }
    return arg;
  });
}
