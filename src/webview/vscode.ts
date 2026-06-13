import type { WebviewMessage } from "../shared/types";

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    __SUPERGIT_VSCODE_API__?: VsCodeApi;
    __SUPERGIT_BOOTSTRAP__?: {
      logoUri: string;
    };
  }
}

let api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
  if (!api) {
    api =
      window.__SUPERGIT_VSCODE_API__ ??
      window.acquireVsCodeApi?.() ??
      ({
        postMessage: (message: WebviewMessage) => console.debug("SuperGit message", message),
        getState: () => undefined,
        setState: () => undefined
      } satisfies VsCodeApi);
  }
  return api;
}

export function postMessage(message: WebviewMessage): void {
  getVsCodeApi().postMessage(message);
}

export function postWebviewLog(level: "debug" | "info" | "warn" | "error", message: string, details?: unknown): void {
  postMessage({ type: "webview-log", level, message, details });
}

export function getBootstrapLogo(): string {
  return window.__SUPERGIT_BOOTSTRAP__?.logoUri ?? "";
}
