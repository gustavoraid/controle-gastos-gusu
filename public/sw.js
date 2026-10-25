// Service worker mínimo: deixa o app abrir rápido (e sem internet) guardando
// o "esqueleto" (HTML/JS/CSS/ícones). Dados do Supabase nunca são cacheados.
const CACHE = "gastos-v6"; // trocar a versão força os celulares a buscar o manifesto novo

self.addEventListener("install", (e) => {
  const shell = ["./", "./manifest.webmanifest", "./icons/icon.svg"].map((u) => new Request(u, { cache: "reload" }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(shell)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Páginas: rede primeiro (pega versão nova), cache se estiver offline.
  // "no-cache" pula o cache HTTP do navegador: o GitHub Pages manda o HTML com
  // max-age=600, e sem isso o app abria a versão anterior por até 10 min após o deploy.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req.url, { cache: "no-cache", credentials: "same-origin" })
        .then((res) => {
          // Cada página no seu endereço (index e nova-despesa.html têm manifestos diferentes).
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          return res;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match("./"))),
    );
    return;
  }

  // Arquivos com hash no nome (assets/*) e ícones: cache primeiro.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
