// Updated cache name for new version
const CACHE_NAME = 'taskmaster-v2';

// Updated list of URLs to cache
// Using relative paths and adding external resources for full offline support
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching app shell');
                // Use addAll with error handling
                return cache.addAll(urlsToCache).catch(err => {
                    console.error('Failed to cache resources:', err);
                    // Even if some external resources fail, the install might still be considered successful
                    // depending on requirements. For a "Request failed" on local files,
                    // this indicates a pathing issue, which relative paths should fix.
                });
            })
            .then(() => self.skipWaiting()) // Activate new SW immediately
    );
});

self.addEventListener('fetch', event => {
    // Cache-first strategy
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached response if found
                if (response) {
                    return response;
                }
                
                // Otherwise, fetch from network
                return fetch(event.request).then(
                    networkResponse => {
                        // Optional: Cache new requests dynamically
                        // Be careful what you cache here
                        return networkResponse;
                    }
                ).catch(err => {
                    console.error('Service Worker: Fetch failed:', err);
                    // You could return a custom offline fallback page here if needed
                });
            })
    );
});

self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Delete old caches
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of open pages
    );
});
