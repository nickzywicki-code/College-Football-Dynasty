import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Service worker: registered manually (not vite-plugin-pwa's auto script) so
// a deploy while a tab is already open reloads that tab onto the new build
// instead of silently continuing to run the stale cached one.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl).then((reg) => {
      // Poll for a fresh sw.js periodically and whenever the tab regains focus.
      const check = () => reg.update().catch(() => {});
      setInterval(check, 60_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    }).catch(() => {});

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

// Self-heal for stale caches: compare the running build against the deployed
// version.json (fetched cache-busted, straight from the network). On mismatch,
// nuke every service worker + cache and hard-reload onto the fresh deploy.
// This rescues clients stuck on old builds that predate the auto-update logic.
async function verifyDeployedVersion(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return; // artifact build / dev server: no version.json — skip
    const { build } = (await res.json()) as { build?: string };
    if (!build || build === __BUILD_ID__) return;
    // don't reload-loop if something is off — at most once per minute
    const last = Number(sessionStorage.getItem('gl-heal') ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('gl-heal', String(Date.now()));
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    window.location.reload();
  } catch {
    // offline or blocked — the PWA keeps working from cache, try again later
  }
}
void verifyDeployedVersion();
setInterval(() => void verifyDeployedVersion(), 120_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void verifyDeployedVersion();
});
