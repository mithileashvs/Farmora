const { CLIENT_ORIGIN } = require('./env');

const DEFAULT_ALLOWED_ORIGINS = [
  'https://farmora-rust.vercel.app',
  'http://localhost:5000',
  'http://localhost:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:3000',
];

function parseConfiguredOrigins(originEnv) {
  if (!originEnv || typeof originEnv !== 'string') return [];
  return originEnv
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  const envOrigins = parseConfiguredOrigins(process.env.CLIENT_ORIGIN || CLIENT_ORIGIN);
  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins]));
}

function isOriginAllowed(origin) {
  // Allow requests with no Origin header (same-origin, mobile apps, curl, or server-to-server)
  if (!origin) return true;
  const allowed = getAllowedOrigins();
  return allowed.includes(origin);
}

const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin'],
  optionsSuccessStatus: 204,
};

module.exports = {
  DEFAULT_ALLOWED_ORIGINS,
  getAllowedOrigins,
  isOriginAllowed,
  corsOptions,
};
