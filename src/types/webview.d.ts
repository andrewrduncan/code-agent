interface WebviewApi<T> {
    postMessage(message: any): void;
    getState(): T;
    setState(state: T): void;
}

declare function acquireVsCodeApi<T = unknown>(): WebviewApi<T>;

declare const vscode: {
    postMessage(message: { type: string; [key: string]: any }): void;
}; 