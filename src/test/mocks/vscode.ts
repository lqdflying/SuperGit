export const extensions = {
  getExtension: () => undefined
};

export const workspace = {
  getConfiguration: () => ({
    get: () => undefined
  }),
  createFileSystemWatcher: () => ({
    onDidChange: () => ({ dispose: () => undefined }),
    onDidCreate: () => ({ dispose: () => undefined }),
    onDidDelete: () => ({ dispose: () => undefined }),
    dispose: () => undefined
  })
};

export const window = {
  activeTextEditor: undefined,
  showErrorMessage: () => undefined,
  showWarningMessage: () => undefined,
  showInformationMessage: () => undefined,
  showInputBox: () => undefined,
  createWebviewPanel: () => undefined
};

export const commands = {
  registerCommand: () => ({ dispose: () => undefined }),
  getCommands: () => []
};

export const env = {
  clipboard: {
    writeText: () => undefined
  }
};

export const Disposable = {
  from: (...disposables: Array<{ dispose: () => void }>) => ({
    dispose: () => disposables.forEach((disposable) => disposable.dispose())
  })
};

export const Uri = {
  joinPath: (...parts: Array<{ fsPath?: string; path?: string } | string>) => ({
    fsPath: parts.map((part) => (typeof part === "string" ? part : part.fsPath ?? part.path ?? "")).join("/"),
    toString() {
      return this.fsPath;
    }
  })
};

export const ViewColumn = {
  One: 1
};
