import type { RemoteConfig } from "../shared/types";
import { runGit } from "./runner";

export interface ResolveRemoteDefaultBranchOptions {
  /** When false, only consult local symbolic-ref (no ls-remote). Defaults to false. */
  network?: boolean;
  /** Timeout for network ls-remote lookup. Defaults to 15s. */
  timeoutMs?: number;
}

const REMOTE_DEFAULT_LOOKUP_TIMEOUT_MS = 15_000;

const defaultBranchCache = new Map<string, string | undefined>();
const inflight = new Map<string, Promise<string | undefined>>();

function cacheKey(cwd: string, remote: string): string {
  return `${cwd}\0${remote}`;
}

function inflightKey(cwd: string, remote: string, network: boolean): string {
  return `${cacheKey(cwd, remote)}:${network ? "network" : "local"}`;
}

export function clearRemoteDefaultBranchCache(cwd?: string): void {
  if (!cwd) {
    defaultBranchCache.clear();
    inflight.clear();
    return;
  }

  const prefix = `${cwd}\0`;
  for (const key of defaultBranchCache.keys()) {
    if (key.startsWith(prefix)) {
      defaultBranchCache.delete(key);
    }
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) {
      inflight.delete(key);
    }
  }
}

export async function resolveRemoteDefaultBranch(
  cwd: string,
  remote: string,
  options: ResolveRemoteDefaultBranchOptions = {}
): Promise<string | undefined> {
  const network = options.network === true;
  const key = cacheKey(cwd, remote);
  if (defaultBranchCache.has(key)) {
    return defaultBranchCache.get(key);
  }

  const pendingKey = inflightKey(cwd, remote, network);
  const pending = inflight.get(pendingKey);
  if (pending) {
    return pending;
  }

  const lookup = lookupRemoteDefaultBranch(cwd, remote, network, options.timeoutMs ?? REMOTE_DEFAULT_LOOKUP_TIMEOUT_MS).then((branch) => {
    // Local-only misses stay uncached so a later network lookup can upgrade the result.
    if (branch !== undefined || network) {
      defaultBranchCache.set(key, branch);
    }
    return branch;
  });
  inflight.set(pendingKey, lookup);

  try {
    return await lookup;
  } finally {
    inflight.delete(pendingKey);
  }
}

export async function enrichRemotesWithDefaultBranches(
  cwd: string,
  remotes: RemoteConfig[],
  options: ResolveRemoteDefaultBranchOptions = { network: true }
): Promise<RemoteConfig[]> {
  return Promise.all(
    remotes.map(async (remote) => ({
      ...remote,
      defaultBranch: await resolveRemoteDefaultBranch(cwd, remote.name, options)
    }))
  );
}

async function lookupRemoteDefaultBranch(
  cwd: string,
  remote: string,
  network: boolean,
  timeoutMs: number
): Promise<string | undefined> {
  const symbolic = await runGit(["symbolic-ref", `refs/remotes/${remote}/HEAD`], cwd);
  if (symbolic.exitCode === 0) {
    const ref = symbolic.stdout.trim();
    const prefix = `refs/remotes/${remote}/`;
    if (ref.startsWith(prefix)) {
      return ref.slice(prefix.length);
    }
  }

  if (!network) {
    return undefined;
  }

  const symref = await runGit(["ls-remote", "--symref", remote, "HEAD"], cwd, { timeout: timeoutMs });
  if (symref.exitCode === 0) {
    for (const line of symref.stdout.split("\n")) {
      const match = line.match(/^ref:\s+refs\/heads\/(\S+)\s+/);
      if (match?.[1]) {
        return match[1];
      }
    }
  }

  return undefined;
}
