const mongoose = require('mongoose');

/**
 * IMPORTANT — read before extending this model:
 *
 * This is a lightweight "remember my phone/password so I can get back to
 * my anonymous profile on any device" mechanism, NOT real authentication.
 * There is:
 *   - no session/JWT issued after login — the client just receives back
 *     the plain `userId` string and stores it locally, exactly like the
 *     Phase 2 anonymous-identity mechanism already worked
 *   - no verification on subsequent requests that the caller who presents
 *     a given `userId` is the same person who logged into that account
 *   - no email verification, password reset flow, or rate-limit-proof
 *     brute-force protection beyond the request-rate limiter on the routes
 *
 * Passwords are hashed (scrypt, see utils/password.js) — never stored or
 * logged in plain text — but this remains a convenience mechanism for
 * recovering a `userId`, not a security boundary. Do not use it to gate
 * access to anything you actually need to protect.
 */
const accountSchema = new mongoose.Schema(
  {
    // The anonymous userId (see models/User.js) this account is linked to
    // — this is what actually owns farms/diagnoses/chat history. Signing
    // up links the *current* device's anonymous id; logging in on another
    // device restores that same id there.
    userId: { type: String, required: true, trim: true, maxlength: 100 },
    name: { type: String, trim: true, maxlength: 100, default: '' },
    // Loosely-validated phone number, used only as this account's lookup
    // key — not verified via SMS/OTP.
    phone: { type: String, required: true, trim: true, unique: true, maxlength: 20 },
    // "<saltHex>:<hashHex>" — never the plain password.
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

accountSchema.index({ phone: 1 }, { unique: true });

module.exports = mongoose.model('Account', accountSchema);
