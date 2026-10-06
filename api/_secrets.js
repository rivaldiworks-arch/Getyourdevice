"use strict";
const { createHmac } = require("node:crypto");

// Dedicated secret for server-side HMAC derivations (checkout capability tokens and
// rate-limit client keys). It is deliberately separate from SUPABASE_SERVICE_ROLE_KEY
// so that rotating the database credential never changes derived values, and a leak
// of one secret does not expose the other purpose.
const MIN_SECRET_LENGTH=32;

class ServerConfigError extends Error {
  constructor(message) {
    super(message);
    this.name="ServerConfigError";
    this.code="SERVER_CONFIG";
  }
}

function serverHmacSecret() {
  const secret=String(process.env.SERVER_HMAC_SECRET||"");
  if(!secret) throw new ServerConfigError("SERVER_HMAC_SECRET is not configured");
  if(secret.length<MIN_SECRET_LENGTH) throw new ServerConfigError(`SERVER_HMAC_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  if(secret===String(process.env.SUPABASE_SERVICE_ROLE_KEY||"")) throw new ServerConfigError("SERVER_HMAC_SECRET must differ from SUPABASE_SERVICE_ROLE_KEY");
  return secret;
}

// Purpose strings domain-separate derivations so one HMAC output can never be
// replayed as another (e.g. a payment token as an order-access token).
function serverHmac(purpose,value) {
  if(!/^[a-z][a-z0-9-]{1,31}$/.test(purpose)) throw new Error("Invalid HMAC purpose");
  return createHmac("sha256",serverHmacSecret()).update(`${purpose}:${value}`).digest("hex");
}

function isServerConfigError(error) {
  return error?.code==="SERVER_CONFIG";
}

module.exports={ServerConfigError,isServerConfigError,serverHmac};
