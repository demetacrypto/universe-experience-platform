// Type-only compatibility for the browser's intentionally untyped DOM lookup
// helpers and legacy Web Audio prefix. Runtime behavior remains governed by
// standards APIs and the exact Three.js version installed for CI checking.
export {};

declare global {
  // The app owns the document and uses required, stable IDs. Model those
  // lookups as the canvas-capable form element surface the runtime expects,
  // instead of weakening every DOM element globally.
  interface WebAppElement extends HTMLCanvasElement {
    checked: boolean;
    value: any;
    addEventListener(
      type: string,
      listener: (event: Event & KeyboardEvent & MouseEvent & InputEvent & {
        currentTarget: WebAppElement;
        target: WebAppElement;
      }) => void,
      options?: boolean | AddEventListenerOptions,
    ): void;
  }

  interface Document {
    getElementById(elementId: string): WebAppElement;
  }

  interface Element {
    readonly dataset: DOMStringMap;
    focus(options?: FocusOptions): void;
  }

  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

declare module "three" {
  interface Object3D {
    readonly isLight?: boolean;
  }

  interface Vector3 {
    set(...components: number[]): this;
  }
}
