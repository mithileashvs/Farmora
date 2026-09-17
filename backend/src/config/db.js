const dns = require('dns');
const mongoose = require('mongoose');
const { MONGODB_URI, MONGODB_DNS_SERVERS } = require('./env');

// Phase 2 adds persistence, but Farmora must keep working (chat/analyze,
// which don't need the database) even if MongoDB is unreachable. We never
// let a DB failure crash the process or block server startup.

let connectPromise = null;
let dnsConfigured = false;

// MongoDB Atlas connection strings are SRV URIs (mongodb+srv://...), which
// require resolving a `_mongodb._tcp.<cluster>` DNS SRV record before the
// driver can even open a socket. Some environments' default OS resolver
// can't resolve SRV records (observed as `querySrv ECONNREFUSED
// _mongodb._tcp.<cluster>...`), even though the connection itself would
// work fine. Pointing Node's resolver at a public DNS service (configurable
// via MONGODB_DNS_SERVERS) fixes that without touching the URI itself, the
// cluster hostname, TLS, or network access rules.
function configureMongoDns() {
  if (dnsConfigured) return;
  const servers = (MONGODB_DNS_SERVERS || '8.8.8.8,8.8.4.4')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  if (!servers.length) {
    console.warn('[farmora-backend] MONGODB_DNS_SERVERS was set but contained no usable entries; leaving the default OS DNS resolver in place.');
    dnsConfigured = true;
    return;
  }

  try {
    dns.setServers(servers);
    // Safe to log — these are just public DNS server IPs, never the
    // connection string, credentials, or cluster hostname.
    console.log(`[farmora-backend] MongoDB DNS servers configured: ${servers.join(',')}`);
  } catch (err) {
    console.error(`[farmora-backend] Failed to configure DNS servers for MongoDB SRV resolution: ${err.message}`);
  }
  dnsConfigured = true;
}

function isConnected() {
  return mongoose.connection.readyState === 1; // 1 = connected
}

async function connectDb() {
  if (!MONGODB_URI) {
    console.warn(
      '[farmora-backend] MONGODB_URI is not set. Database-backed features ' +
        '(profiles, farms, history) will be unavailable; chat/analyze still work.'
    );
    return null;
  }

  if (connectPromise) return connectPromise;

  // Must happen before mongoose.connect() attempts the SRV lookup — an
  // SRV URI (mongodb+srv://...) resolves its shard hosts via DNS as the
  // very first step of connecting.
  configureMongoDns();

  mongoose.connection.on('error', (err) => {
    console.error(`[farmora-backend] MongoDB connection error: ${err.message}`);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[farmora-backend] MongoDB disconnected.');
  });
  mongoose.connection.on('connected', () => {
    console.log('[farmora-backend] MongoDB connected.');
  });

  connectPromise = mongoose
    .connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    })
    .catch((err) => {
      // Never log err.message's cause chain here if it might embed the URI —
      // Mongoose/MongoDB driver errors for auth/DNS failures do not include
      // the connection string or credentials in .message, only in some
      // driver internals we deliberately don't log.
      console.error(`[farmora-backend] Initial MongoDB connection failed: ${err.message}`);
      connectPromise = null; // allow a future retry
      return null;
    });

  return connectPromise;
}

module.exports = { connectDb, isConnected, configureMongoDns };
