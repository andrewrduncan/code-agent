declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
  setState: (state: any) => void;
  getState: () => any;
};

interface WebviewApi<T> {
  postMessage: (message: T) => void;
  setState: (state: T) => void;
  getState: () => T;
}

declare const vscode: WebviewApi<any>; 