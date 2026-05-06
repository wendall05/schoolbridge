const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ── Helmet security headers ───────────────────────────────────────────────────
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.tailwindcss.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'cdn.tailwindcss.com', 'fonts.googleapis.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
});

// ── Rate limiters ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down' },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts — try again in a minute' },
});

// ── Request logger with masked PII ───────────────────────────────────────────
function maskPhone(str) {
  if (!str) return str;
  return str.replace(/(\+\d{1,3})(\d+)(\d{4})/, (_, prefix, mid, last4) =>
    `${prefix}${'*'.repeat(mid.length)}${last4}`
  );
}

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ip = req.ip || req.connection.remoteAddress;
    const duration = Date.now() - start;
    console.log(`[request] ${req.method} ${req.path} ${res.statusCode} ${duration}ms ip=${ip}`);
  });
  next();
}

// ── HTTPS redirect (production only) ─────────────────────────────────────────
function httpsRedirect(req, res, next) {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
}

module.exports = { helmetMiddleware, globalLimiter, authLimiter, requestLogger, httpsRedirect, maskPhone };
