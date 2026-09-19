const crypto = require('crypto');

const KEY_LENGTH = 64;

/**
 * Salted scrypt password hashing using only Node's built-in `crypto` —
 * deliberately avoids adding bcrypt/argon2 as a new dependency for this.
 * Stores as `<saltHex>:<hashHex>`. Never store or log the plain password
 * or this module's output anywhere except the Account document itself.
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  try {
    const candidate = crypto.scryptSync(password, salt, KEY_LENGTH);
    const expected = Buffer.from(hashHex, 'hex');
    // timingSafeEqual requires equal-length buffers; a length mismatch
    // itself just means "not a match" rather than a comparison error.
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
