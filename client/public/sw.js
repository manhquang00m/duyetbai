// Service worker TOI GIAN cho PWA.
// CO Y KHONG cache JS/CSS/API/media: app chay qua Vite dev server (npm start), cache cac file do se
// lam nguoi dung thay ban cu sau khi sua code, va du lieu API phai luon moi.
// Viec duy nhat: mo app (dieu huong) ma server khong chay -> hien offline.html huong dan bat launcher,
// thay vi trang loi mac dinh cua trinh duyet.
const CACHE = 'threads-aff-offline-v2' // tang khi doi offline.html / logo
const OFFLINE_URL = '/offline.html'
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return // moi request khac: de trinh duyet tu xu ly
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)))
})
