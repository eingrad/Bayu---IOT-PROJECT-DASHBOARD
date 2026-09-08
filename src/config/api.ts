// Central API endpoints.
//
// Everything is relative: the browser calls the same origin that served the
// page, and the reverse proxy in front (the frontend's own nginx in
// production, Vite's dev proxy locally) forwards /api -> main server and
// /public-api -> public API.
//
// Keeping these relative means the built frontend bundle contains no hostname,
// so the same image runs on localhost, a staging box, or the production domain
// with no rebuild.

export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export const PUBLIC_API_BASE =
  import.meta.env.VITE_PUBLIC_API_BASE ?? "/public-api";

// ws:// on plain HTTP, wss:// on HTTPS — a page served over HTTPS cannot open
// an insecure socket, so this has to follow the page's protocol.
export function wsUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) return envUrl;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}
