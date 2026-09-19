// Frontend runtime config — safe to commit, contains NO secrets.
// The Groq API key now lives only in backend/.env and is never sent to the browser.
//
// API_BASE_URL: leave empty ("") to call the backend on the SAME origin the
// frontend is served from — this is the default, since the backend serves
// this frontend directory itself (visit http://localhost:5000).
// Only set this if the frontend is hosted on a DIFFERENT origin than the
// backend (e.g. GitHub Pages frontend + separately hosted backend).
window.FARMORA_CONFIG = {
  API_BASE_URL: "https://farmora-backend-148m.onrender.com"
};
