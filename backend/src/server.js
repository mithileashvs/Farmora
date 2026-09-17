const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { PORT, CLIENT_ORIGIN, NODE_ENV } = require('./config/env');
const { connectDb } = require('./config/db');
const healthRoutes = require('./routes/health.routes');
const chatRoutes = require('./routes/chat.routes');
const analysisRoutes = require('./routes/analysis.routes');
const userRoutes = require('./routes/user.routes');
const farmRoutes = require('./routes/farm.routes');
const diagnosisRoutes = require('./routes/diagnosis.routes');
const chatHistoryRoutes = require('./routes/chatHistory.routes');
const knowledgeRoutes = require('./rag/routes/knowledge.routes');
const errorMiddleware = require('./middleware/error.middleware');

// Never blocks server startup and never crashes the process if MongoDB is
// unreachable — see backend/src/config/db.js.
connectDb();

const app = express();

app.disable('x-powered-by');
// Explicit CSP (rather than relying on helmet's implicit default) so the
// no-inline-script policy is a deliberate, documented decision: only
// same-origin scripts/styles/images/connections are allowed. This is what
// makes CSP actually enforce "no inline JavaScript" for the frontend served
// below — see frontend/js/app.js and frontend/index.html, which contain no
// inline <script> content or inline event-handler attributes.
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // no 'unsafe-inline', no 'unsafe-eval' — external scripts only
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // inline CSS is a separate, lower-risk concern — not addressed here
        imgSrc: ["'self'", 'data:', 'blob:'], // data: for small inline SVG/icons, blob: for camera/file previews
        // Frontend calls this backend's own /api/* routes, plus the
        // existing (Phase 1, unchanged) direct browser calls to Open-Meteo
        // (weather + geocoding) and Nominatim (reverse geocoding) — see
        // frontend/js/app.js. Restricting to 'self' only would silently
        // break weather/location, which must keep working unchanged.
        connectSrc: [
          "'self'",
          'https://api.open-meteo.com',
          'https://geocoding-api.open-meteo.com',
          'https://nominatim.openstreetmap.org',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'], // Google Fonts (Roboto Slab / Noto Sans Tamil / Inter), unchanged from before
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        manifestSrc: ["'self'", 'blob:'], // PWA manifest is built client-side as a Blob URL (see frontend/js/app.js)
      },
    },
  })
);

const allowedOrigins = CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      // No Origin header = same-origin request (e.g. the frontend served
      // below) or a non-browser client — allow it. Otherwise check the list.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
  })
);

// Chat requests are JSON text only — images go through /api/analyze via
// multipart/form-data instead, so this limit can stay small.
app.use(express.json({ limit: '200kb' }));

// Safe request logging: method, path, status, timing only.
// Never logs request bodies, uploaded image data, or the Groq API key.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

app.use('/api/health', healthRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/analyze', analysisRoutes);
app.use('/api/users', userRoutes);
app.use('/api/farms', farmRoutes);
app.use('/api/diagnoses', diagnosisRoutes);
app.use('/api/chats', chatHistoryRoutes);
app.use('/api/knowledge', knowledgeRoutes);

// Serve the existing static frontend so the whole app can run from a single
// origin locally (visit http://localhost:PORT). The frontend/backend code
// stays in separate folders; this just avoids needing a second dev server
// and CORS setup for local development.
const frontendDir = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found.' });
});

app.use(errorMiddleware);

// Only start listening when this file is run directly (`node src/server.js`
// or `npm start`/`npm run dev`) — not when it's required by tests, so
// supertest can exercise the app without binding a real port.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Farmora backend listening on port ${PORT} (${NODE_ENV})`);
  });
}

module.exports = app;
