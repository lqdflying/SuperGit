import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ThemeProvider } from "./ThemeProvider";
import { postWebviewLog } from "./vscode";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element.");
}

postWebviewLog("info", "webview bundle loaded");

try {
  createRoot(root).render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>
  );
  postWebviewLog("info", "react app render scheduled");
} catch (error) {
  postWebviewLog("error", "react app render failed", error instanceof Error ? error.message : String(error));
  throw error;
}
