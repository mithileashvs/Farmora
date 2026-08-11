# 🌾 Farmora — AI Farming Assistant

Farmora is a single-page AI chatbot built for farmers, offering advice on soil, leaf/crop health, and weather-aware farming guidance in multiple languages (including Tamil).

## Features
- AI chat assistant powered by Groq (vision-capable model for soil/leaf photo analysis)
- Weather lookup via Open-Meteo
- Location/geocoding via Open-Meteo & OpenStreetMap Nominatim
- Installable as a PWA (Progressive Web App)
- Tamil + English language support

## Setup

This app is a static site — no build step required.

1. **Clone the repo**
   ```bash
   git clone https://github.com/YOUR_USERNAME/farmora.git
   cd farmora
   ```

2. **Add your API key**

   Copy the example config and add your own [Groq](https://console.groq.com) API key:
   ```bash
   cp config.example.js config.js
   ```
   Then open `config.js` and replace `YOUR_GROQ_API_KEY_HERE` with your real key.

   > `config.js` is listed in `.gitignore` and will never be committed.

3. **Run it locally**

   Just open `index.html` in a browser, or serve it with any static server, e.g.:
   ```bash
   npx serve .
   ```

## ⚠️ Security note

This is a **client-side-only** app. Even with the key kept out of git via `config.js`, the key is still sent from the browser and is visible to anyone inspecting network requests on the live, deployed site. This setup is fine for local development or a private/internal tool, but **not safe for a public production deployment**.

For production, route the Groq API call through a small backend/serverless proxy (e.g., a Cloudflare Worker or Vercel/Netlify function) that holds the key server-side, so the browser only ever talks to your own endpoint.

## Deployment

To host for free with GitHub Pages:
1. Push this repo to GitHub.
2. Go to **Settings → Pages**, set source to the `main` branch, root folder.
3. Your app will be live at `https://YOUR_USERNAME.github.io/farmora/`.

(Remember: for a public GitHub Pages deployment, the API key is exposed client-side regardless of `.gitignore` — see the security note above.)

## License

Add your preferred license here (e.g., MIT).
