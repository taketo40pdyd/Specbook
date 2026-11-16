/* Specbook Service Worker
   - アプリ本体: ネットワーク優先(失敗時はキャッシュ)で、更新を取りこぼさず、オフラインでも起動
   - 外部ライブラリ/フォント: キャッシュ優先 + 裏で更新
   - Firestore / 認証などの通信は一切さわらない */
var VER = "specbook-v1";
var CORE = ["./"];
var CDN = ["cdnjs.cloudflare.com", "www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VER).then(function (c) {
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VER; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("message", function (e) { if (e.data === "skipWaiting") self.skipWaiting(); });

function put(req, res) {
  if (res && (res.ok || res.type === "opaque")) { var cp = res.clone(); caches.open(VER).then(function (c) { c.put(req, cp); }); }
  return res;
}
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var u = new URL(req.url);
  var same = u.origin === self.location.origin;
  if (!same && CDN.indexOf(u.hostname) < 0) return; /* Firebase API 等は素通し */

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(function (r) { return put(req, r); }).catch(function () {
      return caches.match(req).then(function (m) { return m || caches.match("./") || caches.match("index.html"); });
    }));
    return;
  }
  if (same) {
    e.respondWith(fetch(req).then(function (r) { return put(req, r); }).catch(function () { return caches.match(req); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (m) {
    var net = fetch(req).then(function (r) { return put(req, r); }).catch(function () { return m; });
    return m || net;
  }));
});
