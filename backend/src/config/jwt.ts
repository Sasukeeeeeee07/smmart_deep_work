import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

/** Values that are public (in the repo or its examples) and so must never sign real tokens. */
const PUBLIC_DEFAULTS = new Set(['super_secret_jwt_key', 'change-me-to-a-long-random-string']);

function resolveSecret(): string {
  const configured = process.env.JWT_SECRET?.trim() || '';
  if (configured.length >= 32 && !PUBLIC_DEFAULTS.has(configured)) return configured;

  // Never fall back to a known string: anyone could forge a login token with it.
  // A random secret keeps the server safe, at the cost of signing everyone out on each restart.
  console.error(
    '[SECURITY] JWT_SECRET is missing, too short (< 32 characters) or a public default. ' +
    'Using a random secret for this run, so everyone must sign in again after each restart. ' +
    'Set JWT_SECRET to a long random string in the environment.'
  );
  return crypto.randomBytes(48).toString('hex');
}

export const JWT_SECRET = resolveSecret();
