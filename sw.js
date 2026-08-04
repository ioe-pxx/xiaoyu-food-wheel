const CACHE_NAME = "xiaoyu-food-wheel-v1";
const CORE_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "core.js",
  "app.js",
  "manifest.webmanifest",
  "vendor/lucide.min.js",
  "vendor/spin-wheel-iife.js"
];
const OPTIONAL_ASSETS = [
  "assets/food-sky-bg.webp",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await cache.addAll(CORE_ASSETS);
    await Promise.allSettled(OPTIONAL_ASSETS.map((asset) => cache.add(asset)));
  }));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => event.request.mode === "navigate" ? caches.match("index.html") : undefined)));
});
