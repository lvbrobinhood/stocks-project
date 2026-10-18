// Base URL of the Flask API. Set VITE_API_BASE in production (e.g. the Render
// web service URL); falls back to the local dev server.
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ||
  "http://localhost:8000";
