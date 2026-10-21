// Part 14 S2 pure tests: the minimum-version rule (REQ-FIELD-F05) and the service worker's caching policy (A-126). The service
// worker runs in a sandbox with fake caches, fetch and clients, so each rule is checked without a browser.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { versionPolicy } from "./logic";

type Handler = (event: Record<string, unknown>) => void;

interface Harness {
  handlers: Record<string, Handler>;
  caches: Map<string, Map<string, Response>>;
  fetched: string[];
  skipped: { value: boolean };
  deleted: string[];
  run(event: string, init: Record<string, unknown>): Promise<unknown>;
}

const ORIGIN = "https://field.example.test";
const swSource = readFileSync(join(__dirname, "../../public/sw.js"), "utf8");

function loadWorker(network: (url: string) => Promise<Response>): Harness {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, Response>>();
  const fetched: string[] = [];
  const skipped = { value: false };
  const deleted: string[] = [];
  const cacheApi = {
    keys: async () => [...store.keys()],
    delete: async (key: string) => {
      deleted.push(key);
      return store.delete(key);
    },
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const bucket = store.get(name)!;
      return {
        addAll: async (urls: string[]) => {
          for (const url of urls) bucket.set(url, await network(url));
        },
        put: async (request: { url: string }, response: Response) => {
          bucket.set(request.url, response);
        },
      };
    },
    match: async (request: string | { url: string }) => {
      const key = typeof request === "string" ? request : request.url;
      for (const bucket of store.values()) {
        const hit = bucket.get(key);
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  const sandbox = {
    self: {
      location: { origin: ORIGIN },
      clients: { claim: async () => undefined },
      skipWaiting: () => {
        skipped.value = true;
      },
      addEventListener: (name: string, handler: Handler) => {
        handlers[name] = handler;
      },
    },
    caches: cacheApi,
    fetch: async (request: { url: string }) => {
      fetched.push(request.url);
      return network(request.url);
    },
    Response,
    URL,
    Promise,
  };
  runInNewContext(swSource, sandbox);
  return {
    handlers,
    caches: store,
    fetched,
    skipped,
    deleted,
    run: async (event, init) => {
      let pending: Promise<unknown> = Promise.resolve();
      let answered: unknown = undefined;
      const handler = handlers[event];
      handler({
        ...init,
        waitUntil: (p: Promise<unknown>) => {
          pending = p;
        },
        respondWith: (p: Promise<unknown>) => {
          answered = p;
        },
      });
      await pending;
      return answered;
    },
  };
}

const ok = (body: string) => new Response(body, { status: 200 });
const fetchFor = (routes: Record<string, string>) => async (url: string) => {
  const path = new URL(url, ORIGIN).pathname;
  if (path in routes) return ok(routes[path]);
  return new Response("missing", { status: 404 });
};

describe("minimum app version (REQ-FIELD-F05)", () => {
  it("accepts a current version equal to or above the minimum, comparing numbers and not text", () => {
    expect(versionPolicy("1.10.0", "1.9.0")).toBe("ok");
    expect(versionPolicy("2.0", "2.0.0")).toBe("ok");
    expect(versionPolicy("1.2.3", "1.2.3")).toBe("ok");
  });
  it("requires an update for a version below the minimum", () => {
    expect(versionPolicy("1.0.0", "1.2.0")).toBe("update-required");
    expect(versionPolicy("1.2.2", "1.2.3")).toBe("update-required");
  });
  it("requires an update for a current version that cannot be read", () => {
    expect(versionPolicy("", "1.0.0")).toBe("update-required");
    expect(versionPolicy("1.x", "1.0.0")).toBe("update-required");
  });
  it("refuses a malformed minimum rather than guessing", () => {
    expect(() => versionPolicy("1.0.0", "latest")).toThrow(RangeError);
  });
});

describe("service worker caching policy (A-126)", () => {
  it("precaches the offline page, the manifest and the icon on install, then skips waiting", async () => {
    const worker = loadWorker(fetchFor({ "/offline.html": "<h1>offline</h1>", "/manifest.webmanifest": "{}", "/icons/icon.svg": "<svg/>" }));
    await worker.run("install", {});
    expect([...(worker.caches.get("erp-sw-v1-shell")?.keys() ?? [])].sort()).toEqual(["/icons/icon.svg", "/manifest.webmanifest", "/offline.html"]);
    expect(worker.skipped.value).toBe(true);
  });

  it("serves the offline page for a navigation that fails, and never stores a page", async () => {
    const online = loadWorker(fetchFor({ "/offline.html": "<h1>offline</h1>", "/manifest.webmanifest": "{}", "/icons/icon.svg": "<svg/>" }));
    await online.run("install", {});
    const offline = loadWorker(async () => {
      throw new TypeError("network down");
    });
    offline.caches.set("erp-sw-v1-shell", online.caches.get("erp-sw-v1-shell")!);
    const answer = (await offline.run("fetch", { request: { url: `${ORIGIN}/projects/12`, method: "GET", mode: "navigate" } })) as Response;
    expect(await answer.text()).toBe("<h1>offline</h1>");
    expect(offline.caches.get("erp-sw-v1-shell")?.has(`${ORIGIN}/projects/12`)).toBe(false);
  });

  it("does not intercept API calls or cross-origin requests", async () => {
    const worker = loadWorker(fetchFor({}));
    await worker.run("install", {});
    const api = await worker.run("fetch", { request: { url: `${ORIGIN}/api/inbox`, method: "GET", mode: "cors" } });
    const other = await worker.run("fetch", { request: { url: "https://cdn.example.test/lib.js", method: "GET", mode: "no-cors" } });
    const post = await worker.run("fetch", { request: { url: `${ORIGIN}/fonts/x.woff2`, method: "POST", mode: "same-origin" } });
    expect(api).toBeUndefined();
    expect(other).toBeUndefined();
    expect(post).toBeUndefined();
  });

  it("serves hashed static assets cache-first and stores them only on success", async () => {
    const worker = loadWorker(fetchFor({ "/_next/static/chunks/app.js": "console.log(1)" }));
    await worker.run("install", {});
    const request = { url: `${ORIGIN}/_next/static/chunks/app.js`, method: "GET", mode: "no-cors" };
    const first = (await worker.run("fetch", { request })) as Response;
    expect(await first.text()).toBe("console.log(1)");
    worker.fetched.length = 0;
    const second = (await worker.run("fetch", { request })) as Response;
    expect(await second.text()).toBe("console.log(1)");
    expect(worker.fetched).toEqual([]);
    expect(worker.caches.get("erp-sw-v1-static")?.has(request.url)).toBe(true);
  });

  it("removes caches from older versions on activate and keeps the current ones", async () => {
    const worker = loadWorker(fetchFor({}));
    worker.caches.set("erp-sw-v0-shell", new Map());
    worker.caches.set("erp-sw-v1-static", new Map());
    await worker.run("activate", {});
    expect(worker.deleted).toEqual(["erp-sw-v0-shell"]);
    expect([...worker.caches.keys()]).toEqual(["erp-sw-v1-static"]);
  });
});
