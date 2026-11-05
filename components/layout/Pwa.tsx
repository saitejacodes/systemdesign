"use client";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Download, X } from "lucide-react";

/* ── Service worker ─────────────────────────────────────────────────────────── */

const SW_URL = "/serwist/sw.js";
const REGISTER_DELAY_MS = 3000;

/** Asks the worker to cache this page's HTML and the build files it already loaded before the worker took control. */
async function cacheCurrentPage(withAssets: boolean) {
  const reg = await navigator.serviceWorker.ready;
  if (!navigator.onLine || !reg.active) return;
  const urls: (string | [string, RequestInit])[] = [[location.pathname, { headers: { accept: "text/html" } }]];
  if (withAssets) {
    for (const e of performance.getEntriesByType("resource")) {
      const u = new URL(e.name);
      if (u.origin === location.origin && u.pathname.startsWith("/_next/static/")) urls.push(u.pathname);
    }
  }
  reg.active.postMessage({ type: "CACHE_URLS", payload: { urlsToCache: urls } });
}

/**
 * Registers the service worker in production builds only (never under `next dev`, where chunks are not
 * hashed and a cache-first worker would serve stale code). Mounted once in the root layout.
 */
export function ServiceWorker() {
  const pathname = usePathname();
  const enabled = process.env.NODE_ENV === "production" && typeof navigator !== "undefined" && "serviceWorker" in navigator;

  useEffect(() => {
    if (!enabled) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const register = () => navigator.serviceWorker.register(SW_URL, { scope: "/" }).then(
      async () => {
        // Files fetched before the worker took control never passed through it. Once it controls the
        // page every later fetch does, so one sweep then (and one more for requests still in flight) is complete.
        if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
        await cacheCurrentPage(true);
        timers.push(setTimeout(() => void cacheCurrentPage(true), 5000));
      },
      () => { /* unsupported or blocked (private mode): the app works online as before */ },
    );
    // Register a few seconds after load, so installing the worker never competes with the first page load.
    const later = () => timers.push(setTimeout(register, REGISTER_DELAY_MS));
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later, { once: true });
    return () => { timers.forEach(clearTimeout); window.removeEventListener("load", later); };
  }, [enabled]);

  // Client-side navigations only fetch the RSC payload; cache the full page too so a reload offline works.
  useEffect(() => {
    if (enabled && navigator.serviceWorker.controller) void cacheCurrentPage(false);
  }, [enabled, pathname]);

  return null;
}

/* ── Install prompt and online state ────────────────────────────────────────── */

interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

const DISMISS_KEY = "sdl-install-dismissed";
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  // Captured at module load so an early event is not missed before the button mounts.
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; emit(); });
  window.addEventListener("appinstalled", () => { deferred = null; emit(); });
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const dismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } };
const standalone = () => matchMedia("(display-mode: standalone)").matches;
const canInstall = () => !!deferred && !dismissed() && !standalone();

/** "Install app" in the top bar: shown only when the browser offers installation and the learner hasn't dismissed it. */
export function InstallButton() {
  const show = useSyncExternalStore(subscribe, canInstall, () => false);
  if (!show) return null;
  const install = async () => {
    const e = deferred;
    if (!e) return;
    await e.prompt();
    await e.userChoice;
    deferred = null; // a prompt event can be used once
    emit();
  };
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage blocked: hide for this page only */ } deferred = null; emit(); };
  return (
    <span className="inline-flex" data-testid="install-app">
      <button type="button" className="fm-btn fm-btn--tool" onClick={install} aria-label="Install SysDesign Lab as an app">
        <Download size={14} aria-hidden /><span className="hidden sm:inline">Install app</span>
      </button>
      <button type="button" className="fm-btn fm-btn--tool -ml-px" onClick={dismiss} aria-label="Dismiss install prompt">
        <X size={12} aria-hidden />
      </button>
    </span>
  );
}

const subscribeOnline = (l: () => void) => {
  window.addEventListener("online", l);
  window.addEventListener("offline", l);
  return () => { window.removeEventListener("online", l); window.removeEventListener("offline", l); };
};

/** A small status chip while the browser reports no connection. */
export function OfflineBadge() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <span className="fm-status fm-status--hot shrink-0" role="status" title="You're offline. Pages and simulators you've opened before still work; AI features need a connection.">
      <span className="g" aria-hidden>●</span>Offline
    </span>
  );
}
