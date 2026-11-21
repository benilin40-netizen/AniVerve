import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

// Enable React act environment before importing react / react-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type EventCb = (...args: unknown[]) => unknown;

function installMinimalDom() {
  const listeners = new Map<string, Set<EventCb>>();
  const docListeners = new Map<string, Set<EventCb>>();
  const storageMap = new Map<string, string>();

  const makeStyle = () => {
    const target: Record<string, any> = {
      setProperty(k: string, v: string) {
        target[k] = String(v);
      },
      removeProperty(k: string) {
        delete target[k];
      },
    };
    return new Proxy<Record<string, any>>(target, {
      set(t, k, v) {
        t[String(k)] = String(v);
        return true;
      },
      get(t, k) {
        if (k in t) return t[String(k)];
        return '';
      },
    });
  };

  class FakeNode {
    nodeType: number;
    nodeName: string;
    parentNode: FakeNode | null = null;
    childNodes: FakeNode[] = [];
    ownerDocument: any = null;
    textContentValue = '';

    constructor(nodeType: number, nodeName: string) {
      this.nodeType = nodeType;
      this.nodeName = nodeName;
    }

    get firstChild(): FakeNode | null {
      return this.childNodes[0] || null;
    }

    get lastChild(): FakeNode | null {
      return this.childNodes[this.childNodes.length - 1] || null;
    }

    get nextSibling(): FakeNode | null {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx >= 0 && idx + 1 < this.parentNode.childNodes.length
        ? this.parentNode.childNodes[idx + 1]
        : null;
    }

    get previousSibling(): FakeNode | null {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx > 0 ? this.parentNode.childNodes[idx - 1] : null;
    }

    get textContent(): string {
      if (this.nodeType === 3 || this.nodeType === 8) return this.textContentValue;
      return this.childNodes.map((c) => c.textContent).join('');
    }

    set textContent(val: string) {
      const str = String(val ?? '');
      this.textContentValue = str;
      if (this.nodeType === 1) {
        this.childNodes = [];
        if (str !== '') {
          const textNode = new FakeNode(3, '#text');
          textNode.textContentValue = str;
          textNode.parentNode = this;
          textNode.ownerDocument = this.ownerDocument;
          this.childNodes.push(textNode);
        }
      }
    }

    get nodeValue(): string {
      return this.textContentValue;
    }

    set nodeValue(val: string) {
      this.textContentValue = String(val ?? '');
    }

    get data(): string {
      return this.textContentValue;
    }

    set data(val: string) {
      this.textContentValue = String(val ?? '');
    }

    appendChild<T extends FakeNode>(child: T): T {
      if (child.nodeType === 11) {
        for (const c of [...child.childNodes]) this.appendChild(c);
        return child;
      }
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }

    insertBefore<T extends FakeNode>(newNode: T, refNode: FakeNode | null): T {
      if (!refNode) return this.appendChild(newNode);
      if (newNode.nodeType === 11) {
        for (const c of [...newNode.childNodes]) this.insertBefore(c, refNode);
        return newNode;
      }
      if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
      const idx = this.childNodes.indexOf(refNode);
      if (idx === -1) return this.appendChild(newNode);
      newNode.parentNode = this;
      this.childNodes.splice(idx, 0, newNode);
      return newNode;
    }

    removeChild<T extends FakeNode>(child: T): T {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }

    contains(other: FakeNode | null): boolean {
      if (!other) return false;
      if (other === this) return true;
      return this.childNodes.some((c) => c.contains(other));
    }

    cloneNode(deep = false): FakeNode {
      const cloned = new FakeNode(this.nodeType, this.nodeName);
      cloned.textContentValue = this.textContentValue;
      if (deep) {
        for (const child of this.childNodes) {
          cloned.appendChild(child.cloneNode(true));
        }
      }
      return cloned;
    }
  }

  class FakeElement extends FakeNode {
    tagName: string;
    namespaceURI = 'http://www.w3.org/1999/xhtml';
    attributes = new Map<string, string>();
    style = makeStyle();
    eventListeners = new Map<string, Set<EventCb>>();
    value = '';
    checked = false;
    disabled = false;
    muted = false;
    volume = 1;
    currentTime = 0;
    paused = true;
    src = '';
    href = '';
    rel = '';
    type = '';
    className = '';
    id = '';
    textTracks: any[] = [];
    classList = {
      add: () => {},
      remove: () => {},
      contains: () => false,
      toggle: () => false,
    };

    constructor(tagName: string, ns = 'http://www.w3.org/1999/xhtml') {
      super(1, tagName.toUpperCase());
      this.tagName = tagName.toUpperCase();
      this.namespaceURI = ns;
    }

    setAttribute(name: string, val: string) {
      const str = String(val);
      this.attributes.set(name, str);
      if (name === 'id') this.id = str;
      if (name === 'class') this.className = str;
      if (name === 'disabled') this.disabled = str !== 'false';
      if (name === 'src') this.src = str;
      if (name === 'href') this.href = str;
      if (name === 'value') this.value = str;
    }

    getAttribute(name: string): string | null {
      return this.attributes.get(name) ?? null;
    }

    removeAttribute(name: string) {
      this.attributes.delete(name);
      if (name === 'disabled') this.disabled = false;
      if (name === 'src') this.src = '';
    }

    hasAttribute(name: string): boolean {
      return this.attributes.has(name);
    }

    addEventListener(type: string, fn: EventCb) {
      if (!this.eventListeners.has(type)) this.eventListeners.set(type, new Set());
      this.eventListeners.get(type)!.add(fn);
    }

    removeEventListener(type: string, fn: EventCb) {
      this.eventListeners.get(type)?.delete(fn);
    }

    dispatchEvent(event: Record<string, unknown> & { type: string; bubbles?: boolean; stopPropagation?: () => void }) {
      if (!event.target) event.target = this;
      let stopped = false;
      const origStop = event.stopPropagation;
      event.stopPropagation = () => {
        stopped = true;
        if (typeof origStop === 'function') origStop.call(event);
      };

      event.currentTarget = this;
      for (const fn of [...(this.eventListeners.get(event.type) || [])]) {
        fn(event);
      }
      let cur: FakeNode | null = stopped || !event.bubbles ? null : this.parentNode;
      while (cur) {
        if (cur instanceof FakeElement) {
          event.currentTarget = cur;
          for (const fn of [...(cur.eventListeners.get(event.type) || [])]) {
            fn(event);
          }
          if (stopped || !event.bubbles) break;
        }
        cur = cur.parentNode;
      }
      if (!stopped && event.bubbles && this.ownerDocument && docListeners.has(event.type)) {
        event.currentTarget = this.ownerDocument;
        for (const fn of [...(docListeners.get(event.type) || [])]) {
          fn(event);
        }
      }
      return !event.defaultPrevented;
    }

    click() {
      this.dispatchEvent({
        type: 'click',
        bubbles: true,
        cancelable: true,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopPropagation() {},
      });
    }

    focus() {}
    blur() {}
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    load() {}
    canPlayType() {
      return '';
    }

    querySelectorAll(selector: string): FakeElement[] {
      const results: FakeElement[] = [];
      const walk = (node: FakeNode) => {
        for (const child of node.childNodes) {
          if (child instanceof FakeElement) {
            if (matchesSelector(child, selector)) results.push(child);
            walk(child);
          }
        }
      };
      walk(this);
      return results;
    }

    querySelector(selector: string): FakeElement | null {
      return this.querySelectorAll(selector)[0] || null;
    }

    getBoundingClientRect() {
      return { top: 0, left: 0, bottom: 100, right: 100, width: 100, height: 100 };
    }
  }

  function matchesSelector(el: FakeElement, selector: string): boolean {
    if (selector.startsWith('#')) {
      return el.id === selector.slice(1) || el.getAttribute('id') === selector.slice(1);
    }
    const tagAttrMatch = selector.match(/^([a-z0-9]+)\[([a-z-]+)="([^"]+)"\]$/i);
    if (tagAttrMatch) {
      const [, tag, attr, val] = tagAttrMatch;
      return el.tagName.toLowerCase() === tag.toLowerCase() && el.getAttribute(attr) === val;
    }
    const attrOnly = selector.match(/^\[([a-z-]+)="([^"]+)"\]$/i);
    if (attrOnly) {
      const [, attr, val] = attrOnly;
      return el.getAttribute(attr) === val;
    }
    return el.tagName.toLowerCase() === selector.toLowerCase();
  }

  const head = new FakeElement('head');
  const body = new FakeElement('body');
  const htmlEl = new FakeElement('html');
  htmlEl.appendChild(head);
  htmlEl.appendChild(body);
  const rootDiv = new FakeElement('div');
  rootDiv.setAttribute('id', 'root');
  body.appendChild(rootDiv);

  const doc: any = {
    nodeType: 9,
    documentElement: htmlEl,
    head,
    body,
    title: '',
    cookie: '',
    activeElement: body,
    fullscreenElement: null,
    visibilityState: 'visible',
    exitFullscreen: () => Promise.resolve(),
    createElement: (tag: string) => {
      const el = new FakeElement(tag);
      el.ownerDocument = doc;
      return el;
    },
    createElementNS: (ns: string, tag: string) => {
      const el = new FakeElement(tag, ns);
      el.ownerDocument = doc;
      return el;
    },
    createTextNode: (text: string) => {
      const n = new FakeNode(3, '#text');
      n.textContentValue = String(text ?? '');
      n.ownerDocument = doc;
      return n;
    },
    createComment: (text: string) => {
      const n = new FakeNode(8, '#comment');
      n.textContentValue = String(text ?? '');
      n.ownerDocument = doc;
      return n;
    },
    createDocumentFragment: () => {
      const n = new FakeNode(11, '#document-fragment');
      n.ownerDocument = doc;
      return n;
    },
    getElementById: (id: string) => htmlEl.querySelector(`#${id}`),
    querySelector: (sel: string) => htmlEl.querySelector(sel),
    querySelectorAll: (sel: string) => htmlEl.querySelectorAll(sel),
    addEventListener: (type: string, fn: EventCb) => {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: EventCb) => {
      docListeners.get(type)?.delete(fn);
    },
    createEvent: () => ({
      initEvent() {},
    }),
  };
  htmlEl.ownerDocument = doc;
  head.ownerDocument = doc;
  body.ownerDocument = doc;
  rootDiv.ownerDocument = doc;

  const win: any = Object.create(globalThis);
  Object.assign(win, {
    document: doc,
    location: {
      origin: 'http://127.0.0.1:3000',
      pathname: '/watch/frieren-215709/1',
      href: 'http://127.0.0.1:3000/watch/frieren-215709/1',
    },
    localStorage: {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => storageMap.set(k, String(v)),
      removeItem: (k: string) => storageMap.delete(k),
      clear: () => storageMap.clear(),
    },
    matchMedia: () => ({
      matches: true,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
    addEventListener: (type: string, fn: EventCb) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: EventCb) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (ev: { type: string }) => {
      for (const fn of [...(listeners.get(ev.type) || [])]) fn(ev);
      return true;
    },
    requestAnimationFrame: (cb: EventCb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id: any) => clearTimeout(id),
    Event: class FakeEvent {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    },
    CustomEvent: class FakeCustomEvent {
      type: string;
      detail: any;
      constructor(type: string, init?: any) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    Node: FakeNode,
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLIFrameElement: FakeElement,
    HTMLVideoElement: FakeElement,
    HTMLButtonElement: FakeElement,
    HTMLInputElement: FakeElement,
    HTMLSelectElement: FakeElement,
    SVGElement: FakeElement,
    Text: FakeNode,
    Comment: FakeNode,
    DocumentFragment: FakeNode,
  });
  win.window = win;

  const savedGlobals = new Map<string, any>();
  const keys = [
    'window',
    'document',
    'localStorage',
    'matchMedia',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'Event',
    'CustomEvent',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLIFrameElement',
    'HTMLVideoElement',
    'HTMLButtonElement',
    'HTMLInputElement',
    'HTMLSelectElement',
    'SVGElement',
    'Text',
    'Comment',
    'DocumentFragment',
  ];
  for (const key of keys) {
    savedGlobals.set(key, (globalThis as any)[key]);
    Object.defineProperty(globalThis, key, {
      value: win[key],
      configurable: true,
      writable: true,
    });
  }

  return {
    rootDiv,
    doc,
    win,
    cleanup() {
      for (const [k, v] of savedGlobals.entries()) {
        if (v === undefined) {
          delete (globalThis as any)[k];
        } else {
          Object.defineProperty(globalThis, k, {
            value: v,
            configurable: true,
            writable: true,
          });
        }
      }
    },
  };
}

function collectButtons(root: any): any[] {
  return root.querySelectorAll('button');
}

function getText(node: any): string {
  return (node?.textContent || '').replace(/\s+/g, ' ').trim();
}

describe('Milestone 1 — WatchPage React Hooks Order & Lifecycle Verification', () => {
  let dom: ReturnType<typeof installMinimalDom>;
  const origFetch = globalThis.fetch;
  const origConsoleError = console.error;
  const origConsoleWarn = console.warn;

  before(() => {
    dom = installMinimalDom();
  });

  after(() => {
    globalThis.fetch = origFetch;
    console.error = origConsoleError;
    console.warn = origConsoleWarn;
    dom.cleanup();
  });

  it('Source structure guard: WatchPage, Player, and EpisodeSelector place all hooks strictly above early returns', () => {
    const checks: Array<{ relPath: string; componentName: string }> = [
      { relPath: 'src/pages/Watch/WatchPage.tsx', componentName: 'WatchPage' },
      { relPath: 'src/components/player/Player.tsx', componentName: 'Player' },
      { relPath: 'src/components/player/EpisodeSelector.tsx', componentName: 'EpisodeSelector' },
    ];

    for (const { relPath, componentName } of checks) {
      const fullPath = path.resolve(process.cwd(), relPath);
      const src = fs.readFileSync(fullPath, 'utf8');
      const declPattern = new RegExp(`export function ${componentName}\\b`);
      const startMatch = declPattern.exec(src);
      assert.ok(startMatch, `Expected ${componentName} export in ${relPath}`);

      const slice = src.slice(startMatch.index);
      const lines = slice.split('\n');

      // Find ONLY component-level returns (before the final JSX return) vs hook invocations
      let braceDepth = 0;
      let startedBody = false;
      let inHookParens = 0;
      let firstComponentEarlyReturnLine = -1;
      const hooksAfterReturn: string[] = [];
      const renderTimeRefMutations: string[] = [];

      const hookCallRe = /\b(use(?:State|Effect|Memo|Callback|Ref|Context|Reducer|LayoutEffect|Params|Navigate|DocumentMeta|Library|Auth|Toast|Theme|Notifications|QuickView))\s*\(/g;

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) continue;

        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;

        if (!startedBody && openBraces > 0) {
          startedBody = true;
        }

        const isComponentTopLevel = startedBody && braceDepth === 1 && inHookParens === 0;

        if (isComponentTopLevel) {
          if (
            (/^if\s*\(/.test(trimmed) && /\)\s*return\b/.test(trimmed)) ||
            /^return\b/.test(trimmed)
          ) {
            if (firstComponentEarlyReturnLine === -1) firstComponentEarlyReturnLine = i + 1;
          }
          if (/^\w+Ref\.current\s*=/.test(trimmed)) {
            renderTimeRefMutations.push(`line ${i + 1}: ${trimmed}`);
          }
        }

        // Detect multi-line component-level `if (...) {\n return ...`
        if (startedBody && braceDepth === 2 && inHookParens === 0 && /^return\b/.test(trimmed)) {
          const prevTrimmed = (lines[i - 1] || '').trim();
          if (/^if\s*\(/.test(prevTrimmed) && firstComponentEarlyReturnLine === -1) {
            firstComponentEarlyReturnLine = i;
          }
        }

        if (firstComponentEarlyReturnLine !== -1) {
          let match: RegExpExecArray | null;
          hookCallRe.lastIndex = 0;
          while ((match = hookCallRe.exec(line)) !== null) {
            hooksAfterReturn.push(`${match[1]} at component line ${i + 1}`);
          }
        }

        // Track hook call parentheses only at component top-level
        if (isComponentTopLevel && hookCallRe.test(trimmed)) {
          inHookParens += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
        } else if (inHookParens > 0) {
          inHookParens += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
          if (inHookParens < 0) inHookParens = 0;
        }

        braceDepth += openBraces - closeBraces;
        if (startedBody && braceDepth <= 0) break;
      }

      assert.deepEqual(
        hooksAfterReturn,
        [],
        `${relPath} (${componentName}): found hooks after conditional return: ${hooksAfterReturn.join(', ')}`
      );
      assert.deepEqual(
        renderTimeRefMutations,
        [],
        `${relPath} (${componentName}): found render-time ref.current mutations: ${renderTimeRefMutations.join(', ')}`
      );
    }
  });

  it('StrictMode React lifecycle test: renders initial, loading, loaded, episodes, provider switch, failure, episode switch, away/back, and history back/forward with 0 hook errors', async () => {
    const React = await import('react');
    const { StrictMode, act } = React;
    const { createRoot } = await import('react-dom/client');
    const { MemoryRouter, Route, Routes, useNavigate } = await import('react-router-dom');
    const { ThemeProvider } = await import('../../src/context/ThemeContext.tsx');
    const { ToastProvider } = await import('../../src/context/ToastContext.tsx');
    const { AuthProvider } = await import('../../src/context/AuthContext.tsx');
    const { LibraryProvider } = await import('../../src/context/LibraryContext.tsx');
    const { QuickViewProvider } = await import('../../src/context/QuickViewContext.tsx');
    const { WatchPage } = await import('../../src/pages/Watch/WatchPage.tsx');

    const capturedErrors: string[] = [];
    console.error = (...args: any[]) => {
      const msg = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ');
      capturedErrors.push(msg);
    };
    console.warn = (...args: any[]) => {
      const msg = args.map((a) => String(a)).join(' ');
      if (/hook|strict/i.test(msg)) capturedErrors.push(msg);
    };

    let navRef: ((to: any) => void) | null = null;
    function NavSpy() {
      const navigate = useNavigate();
      navRef = navigate;
      return null;
    }

    let resolveAnimeDetails: ((val: any) => void) | null = null;
    let resolveEpisodes: ((val: any) => void) | null = null;
    let resolveSources: ((val: any) => void) | null = null;
    let providerSwitchMode: 'success' | 'fail_all' = 'success';
    let currentAnimeIdRequested = 0;

    const makeAnime = (id: number, title: string, slug: string) => ({
      id,
      idMal: id + 1000,
      slug,
      title: { romaji: title, english: title, native: title },
      description: 'Test anime description.',
      episodes: 12,
      status: 'FINISHED',
      format: 'TV',
      season: 'FALL',
      seasonYear: 2024,
      averageScore: 88,
      genres: ['Action', 'Adventure'],
      coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/1.jpg' },
      relations: { edges: [] },
      recommendations: { nodes: [] },
    });

    const providersPayload = {
      providers: [
        {
          id: 'p1',
          name: 'Yenime',
          key: 'yenime',
          baseUrl: 'https://yenime.example',
          embedUrlTemplate: 'https://yenime.example/embed/{anilistId}/{ep}',
          adapterType: 'yenime',
          supportedIdTypes: ['anilist', 'mal'],
          supportedLanguages: ['sub', 'dub'],
          supportedFormats: ['hls', 'embed'],
          isEnabled: true,
          licenseVerified: true,
          embeddingAllowed: true,
          priority: 1,
          errorCount: 0,
        },
        {
          id: 'p2',
          name: 'AniEmbed',
          key: 'aniembed',
          baseUrl: 'https://aniembed.example',
          embedUrlTemplate: 'https://aniembed.example/e/{anilistId}/{ep}',
          adapterType: 'aniembed',
          supportedIdTypes: ['anilist', 'mal'],
          supportedLanguages: ['sub', 'dub'],
          supportedFormats: ['embed'],
          isEnabled: true,
          licenseVerified: true,
          embeddingAllowed: true,
          priority: 2,
          errorCount: 0,
        },
      ],
      registry: [
        {
          key: 'yenime',
          name: 'Yenime',
          role: 'primary',
          adapterType: 'yenime',
          supportedIdTypes: ['anilist', 'mal'],
          supportedLanguages: ['sub', 'dub'],
          supportedFormats: ['hls', 'embed'],
          isEnabled: true,
          licenseVerified: true,
          embeddingAllowed: true,
          availabilityStatus: 'active',
          priority: 1,
          errorCount: 0,
          activated: true,
        },
        {
          key: 'aniembed',
          name: 'AniEmbed',
          role: 'backup',
          adapterType: 'aniembed',
          supportedIdTypes: ['anilist', 'mal'],
          supportedLanguages: ['sub', 'dub'],
          supportedFormats: ['embed'],
          isEnabled: true,
          licenseVerified: true,
          embeddingAllowed: true,
          availabilityStatus: 'active',
          priority: 2,
          errorCount: 0,
          activated: true,
        },
      ],
    };

    const jsonResponse = (data: any, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      json: async () => data,
      text: async () => JSON.stringify(data),
    });

    (globalThis as any).fetch = async (input: any, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      const signal = init?.signal;
      if (signal?.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }

      const withAbort = <T,>(promise: Promise<T>): Promise<T> => {
        if (!signal) return promise;
        return new Promise<T>((resolve, reject) => {
          const onAbort = () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          };
          signal.addEventListener('abort', onAbort, { once: true });
          promise.then(
            (val) => {
              signal.removeEventListener('abort', onAbort);
              resolve(val);
            },
            (err) => {
              signal.removeEventListener('abort', onAbort);
              reject(err);
            }
          );
        });
      };

      if (url.includes('/api/auth/me')) {
        return jsonResponse({ user: null, hasAdmin: true });
      }
      if (url.includes('/api/admin/auth/session')) {
        return jsonResponse({
          authenticated: false,
          mustChangePassword: false,
          authMode: 'backend-password',
        });
      }
      if (url.includes('/api/providers/status') || url.includes('/api/streaming/providers')) {
        return jsonResponse(providersPayload);
      }
      if (url.includes('/api/streaming/telemetry')) {
        return jsonResponse({ ok: true });
      }
      const detailsMatch = url.match(/\/api\/anime\/(\d+)$/);
      if (detailsMatch) {
        const id = Number(detailsMatch[1]);
        currentAnimeIdRequested = id;
        if (id === 215709 && resolveAnimeDetails) {
          return withAbort(
            new Promise((res) => {
              const prev = resolveAnimeDetails!;
              resolveAnimeDetails = (v: any) => {
                prev(v);
                res(jsonResponse(v));
              };
            })
          );
        }
        return jsonResponse({
          anime: makeAnime(id, `Anime #${id}`, `anime-${id}`),
          malInfo: null,
        });
      }
      const epMatch = url.match(/\/api\/anime\/(\d+)\/episodes/);
      if (epMatch) {
        const id = Number(epMatch[1]);
        const payload = {
          anilistId: id,
          malId: id + 1000,
          title: `Anime #${id}`,
          catalogEpisodes: 12,
          discoveredCount: 12,
          discoveryStatus: 'complete',
          partialResults: false,
          providers: ['yenime', 'aniembed'],
          episodes: Array.from({ length: 12 }, (_, i) => ({
            episodeNumber: i + 1,
            numberLabel: String(i + 1),
            title: `Episode ${i + 1}`,
            isSpecial: false,
            hasSub: true,
            hasDub: true,
            providers: ['yenime', 'aniembed'],
            providerMappings: {},
          })),
          cached: false,
          fetchedAt: new Date().toISOString(),
        };
        if (id === 215709 && resolveEpisodes) {
          return withAbort(
            new Promise((res) => {
              const prev = resolveEpisodes!;
              resolveEpisodes = (v: any) => {
                prev(v);
                res(jsonResponse(v || payload));
              };
            })
          );
        }
        return jsonResponse(payload);
      }
      const srcMatch = url.match(/\/api\/anime\/(\d+)\/episode\/([\d.]+)\/sources/);
      if (srcMatch) {
        const ep = Number(srcMatch[2]);
        if (providerSwitchMode === 'fail_all') {
          return jsonResponse(
            {
              sources: [],
              errors: [
                {
                  providerKey: 'yenime',
                  providerName: 'Yenime',
                  message: 'Upstream timeout',
                  status: 502,
                },
                {
                  providerKey: 'aniembed',
                  providerName: 'AniEmbed',
                  message: 'No mirror found',
                  status: 404,
                },
              ],
              allFailed: true,
            },
            200
          );
        }

        const payload = {
          sources: [
            {
              providerKey: 'yenime',
              providerName: 'Yenime',
              role: 'primary',
              format: 'embed',
              directPlayable: false,
              embedUrl: `https://yenime.example/embed/${srcMatch[1]}/${ep}`,
              serverLabel: 'Yenime Sub',
              latencyMs: 120,
            },
            {
              providerKey: 'aniembed',
              providerName: 'AniEmbed',
              role: 'backup',
              format: 'embed',
              directPlayable: false,
              embedUrl: `https://aniembed.example/e/${srcMatch[1]}/${ep}`,
              serverLabel: 'AniEmbed Mirror',
              latencyMs: 140,
            },
          ],
          errors: [],
          allFailed: false,
        };

        if (ep === 1 && Number(srcMatch[1]) === 215709 && resolveSources) {
          return withAbort(
            new Promise((res) => {
              const prev = resolveSources!;
              resolveSources = (v: any) => {
                prev(v);
                res(jsonResponse(v || payload));
              };
            })
          );
        }
        return jsonResponse(payload);
      }

      return jsonResponse({});
    };

    resolveAnimeDetails = () => {};
    resolveEpisodes = () => {};
    resolveSources = () => {};

    const root = createRoot(dom.rootDiv as unknown as Element);

    try {
      // 1 & 2. Initial render + Loading state under React.StrictMode
      await act(async () => {
        root.render(
          React.createElement(
            StrictMode,
            null,
            React.createElement(
              ThemeProvider,
              null,
              React.createElement(
                ToastProvider,
                null,
                React.createElement(
                  AuthProvider,
                  null,
                  React.createElement(
                    LibraryProvider,
                    null,
                    React.createElement(
                      QuickViewProvider,
                      null,
                      React.createElement(
                        MemoryRouter,
                        { initialEntries: ['/watch/frieren-215709/1'] },
                        React.createElement(NavSpy, null),
                        React.createElement(
                          Routes,
                          null,
                          React.createElement(Route, {
                            path: '/watch/:slug/:episode',
                            element: React.createElement(WatchPage, null),
                          }),
                          React.createElement(Route, {
                            path: '/explore',
                            element: React.createElement('div', null, 'Explore Route'),
                          })
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        );
      });

      const flushAct = async () => {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 25));
        });
      };

      assert.equal(currentAnimeIdRequested, 215709, 'Initial render triggered anime details load');

      // 3. Anime loaded (transitions from <DetailSkeleton /> -> full WatchPage tree)
      await act(async () => {
        resolveAnimeDetails?.({
          anime: makeAnime(215709, "Frieren: Beyond Journey's End", 'frieren-215709'),
          malInfo: null,
        });
        resolveAnimeDetails = null;
      });
      await flushAct();

      assert.ok(
        getText(dom.rootDiv).includes('Frieren'),
        'WatchPage transitioned smoothly from DetailSkeleton to loaded anime heading'
      );

      // 4. Episode list loaded
      await act(async () => {
        resolveEpisodes?.(null);
        resolveEpisodes = null;
      });
      await flushAct();

      assert.ok(
        getText(dom.rootDiv).includes('Episodes (12)'),
        `Episode list rendered with 12 episodes; got text: ${getText(dom.rootDiv)}`
      );

      // 5. Provider loading -> resolved
      await act(async () => {
        resolveSources?.(null);
        resolveSources = null;
      });
      await flushAct();

      assert.ok(
        getText(dom.rootDiv).includes('Yenime') && getText(dom.rootDiv).includes('AniEmbed'),
        'Provider switcher rendered Yenime and AniEmbed'
      );

      // 8. Switching servers (Yenime -> AniEmbed)
      const aniembedBtn = collectButtons(dom.rootDiv).find((b) => getText(b).includes('AniEmbed'));
      assert.ok(aniembedBtn, 'AniEmbed server button exists');
      await act(async () => {
        aniembedBtn.click();
      });
      await flushAct();
      assert.ok(
        getText(dom.rootDiv).includes('Playing AniEmbed'),
        'Provider switch updated active stream server to AniEmbed'
      );

      // 7. Switching episodes (Episode 1 -> Episode 2)
      const ep2Btn = collectButtons(dom.rootDiv).find((b) => getText(b) === '2');
      assert.ok(ep2Btn, 'Episode 2 button exists');
      await act(async () => {
        ep2Btn.click();
      });
      await flushAct();
      assert.ok(
        getText(dom.rootDiv).includes('Episode 2'),
        'Switched to Episode 2 cleanly'
      );

      // 6. Provider failure state + Retry recovery
      providerSwitchMode = 'fail_all';
      const ep3Btn = collectButtons(dom.rootDiv).find((b) => getText(b) === '3');
      assert.ok(ep3Btn, 'Episode 3 button exists');
      await act(async () => {
        ep3Btn.click();
      });
      await flushAct();
      assert.ok(
        getText(dom.rootDiv).includes('Playback Unavailable'),
        'Provider failure state renders gracefully'
      );

      providerSwitchMode = 'success';
      const retryBtn = collectButtons(dom.rootDiv).find((b) => getText(b) === 'Retry');
      assert.ok(retryBtn, 'Retry button renders during provider failure');
      await act(async () => {
        retryBtn.click();
      });
      await flushAct();
      assert.ok(
        !getText(dom.rootDiv).includes('Playback Unavailable'),
        'Retry clears Playback Unavailable state cleanly'
      );

      // 9. Navigation away and back
      await act(async () => {
        navRef?.('/explore');
      });
      await flushAct();
      assert.ok(getText(dom.rootDiv).includes('Explore Route'), 'Navigated away to /explore');

      await act(async () => {
        navRef?.('/watch/steins-gate-9253/1');
      });
      await flushAct();
      assert.ok(getText(dom.rootDiv).includes('Anime #9253'), 'Navigated back to Steins Gate WatchPage');

      // 10. Browser Back and Forward transitions
      await act(async () => {
        navRef?.(-1);
      });
      await flushAct();
      assert.ok(getText(dom.rootDiv).includes('Explore Route'), 'Browser Back returned to /explore');

      await act(async () => {
        navRef?.(-1);
      });
      await flushAct();
      assert.ok(getText(dom.rootDiv).includes('Episode 3'), 'Second Browser Back returned to Frieren Ep 3');

      await act(async () => {
        navRef?.(1);
      });
      await act(async () => {
        navRef?.(1);
      });
      await flushAct();
      assert.ok(getText(dom.rootDiv).includes('Anime #9253'), 'Browser Forward returned to Steins Gate WatchPage');

      await act(async () => {
        root.unmount();
      });

      const hookErrors = capturedErrors.filter((e) =>
        /Rendered more hooks|Rendered fewer hooks|order of Hooks|Rules of Hooks|Warning:/i.test(e)
      );
      assert.deepEqual(
        hookErrors,
        [],
        `Expected 0 React Hook or StrictMode errors, got: ${hookErrors.join(' | ')}`
      );
      const unexpectedErrors = capturedErrors.filter((e) => !e.includes('AbortError'));
      assert.deepEqual(
        unexpectedErrors,
        [],
        `Expected 0 console errors across all WatchPage transitions, got: ${unexpectedErrors.join(' | ')}`
      );
    } catch (err: any) {
      if (err?.errors && Array.isArray(err.errors)) {
        const summary = err.errors.map((e: any) => e?.stack || e?.message || String(e)).join('\n---\n');
        throw new Error(`AggregateError details:\n${summary}`);
      }
      throw err;
    } finally {
      try {
        await act(async () => {
          root.unmount();
        });
      } catch {
        // Already unmounted
      }
    }
  });
});
