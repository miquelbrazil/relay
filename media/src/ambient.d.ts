// Globals provided to the webview by vendored <script> tags loaded BEFORE this bundle
// (purify.min.js → DOMPurify, sf-dump.js → Sfdump) plus the VS Code webview bridge. They
// are not bundled — declared ambient so the TypeScript renderers can use them with types.

interface DOMPurifyConfig {
  FORBID_TAGS?: string[];
  ALLOWED_TAGS?: string[];
  ALLOWED_ATTR?: string[];
}

declare const DOMPurify: {
  sanitize(html: string, config?: DOMPurifyConfig): string;
};

// VarDumper's Sfdump makes a `pre.sf-dump` tree interactive, resolved by element id.
declare function Sfdump(id: string): void;

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): VsCodeApi;
