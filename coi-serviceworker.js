/*! coi-serviceworker v0.1.7 - Guido Zuidhof and nicmem, licensed under MIT */
/*
 * This service worker enables SharedArrayBuffer by injecting the required
 * Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers.
 * 
 * Required for RLM Phase 2 synchronous sub_lm() calls on static hosts
 * like GitHub Pages that don't support custom headers.
 */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => {
                    return self.clients.matchAll();
                })
                .then((clients) => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        }
    });

    self.addEventListener("fetch", function (event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }

        const request =
            coepCredentialless && r.mode === "no-cors"
                ? new Request(r, {
                      credentials: "omit",
                  })
                : r;

        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy",
                        coepCredentialless ? "credentialless" : "require-corp"
                    );
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => console.error(e))
        );
    });

} else {
    (() => {
        const reloadedByCOI = window.sessionStorage.getItem("coiReloadedByCOI");
        window.sessionStorage.removeItem("coiReloadedByCOI");
        
        const coiRequested = new URLSearchParams(window.location.search).get("coi") !== "0";

        // Check if we already have cross-origin isolation
        if (window.crossOriginIsolated) {
            // Already isolated, nothing to do
            return;
        }

        // If COI was explicitly disabled via query param, skip
        if (!coiRequested) {
            return;
        }

        // Check for secure context (required for service workers)
        if (!window.isSecureContext) {
            console.log("[COI] Service worker requires a secure context (HTTPS or localhost)");
            return;
        }

        // If we already reloaded and still not isolated, there's an issue
        if (reloadedByCOI) {
            console.warn("[COI] Reloaded but still not cross-origin isolated. SharedArrayBuffer may not be available.");
            return;
        }

        // Register the service worker
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register(window.document.currentScript.src)
                .then(
                    (registration) => {
                        console.log("[COI] Service worker registered for cross-origin isolation");
                        
                        if (registration.active && !navigator.serviceWorker.controller) {
                            // Service worker registered but not controlling this page yet
                            // Reload to activate
                            window.sessionStorage.setItem("coiReloadedByCOI", "true");
                            console.log("[COI] Reloading to enable cross-origin isolation...");
                            window.location.reload();
                        } else if (!registration.active) {
                            // Wait for service worker to activate
                            registration.addEventListener("updatefound", () => {
                                const worker = registration.installing;
                                worker.addEventListener("statechange", () => {
                                    if (worker.state === "activated") {
                                        window.sessionStorage.setItem("coiReloadedByCOI", "true");
                                        console.log("[COI] Reloading to enable cross-origin isolation...");
                                        window.location.reload();
                                    }
                                });
                            });
                        }
                    },
                    (err) => {
                        console.error("[COI] Service worker registration failed:", err);
                    }
                );
        } else {
            console.warn("[COI] Service workers are not supported in this browser");
        }
    })();
}
