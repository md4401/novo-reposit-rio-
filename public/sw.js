// Service worker do ninho.: guarda a "casca" do app para abrir rápido e funcionar com
// internet ruim. Dados financeiros (/api) NUNCA são guardados em cache.
const VERSION = "ninho-v3";
const SHARE_CACHE = "ninho-share";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // "Compartilhar → ninho": guarda o item no aparelho e abre a tela de compartilhamento
  if (request.method === "POST" && url.origin === self.location.origin && url.pathname === "/compartilhar") {
    event.respondWith(
      (async () => {
        const form = await request.formData();
        const cache = await caches.open(SHARE_CACHE);
        const file = form.get("file");
        const text = [form.get("title"), form.get("text")].filter(Boolean).join("\n");
        await cache.delete("/shared/file");
        await cache.delete("/shared/text");
        if (file && typeof file !== "string" && file.size < 8 * 1024 * 1024) await cache.put("/shared/file", new Response(file, { headers: { "Content-Type": file.type } }));
        if (text) await cache.put("/shared/text", new Response(text));
        return Response.redirect("/#/compartilhar", 303);
      })(),
    );
    return;
  }
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Páginas: rede primeiro (versão nova), cache se estiver sem internet
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Arquivos com hash no nome (/assets/...) e ícones: cache primeiro
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

// Resumo diário: o servidor manda só um texto genérico (sem lojas nem valores)
self.addEventListener("push", (event) => {
  let data = { title: "ninho.", body: "Você tem compras para revisar.", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // usa o texto padrão
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "ninho-digest",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.navigate(url).then((w) => w?.focus());
      return self.clients.openWindow(url);
    }),
  );
});
