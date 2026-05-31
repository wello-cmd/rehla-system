// In-Memory Rate Limiter Middleware
// Prevents brute-force / DDoS attacks on endpoints without external dependencies (NFR-RL-05 compliance)

const rateLimit = (limit = 100, windowMs = 15 * 60 * 1000) => {
  const ipRequests = new Map();
  let lastCleanupTime = Date.now();

  const middleware = (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();

    // Lazy cleanup of the entire map periodically to prevent memory growth
    if (now - lastCleanupTime > windowMs) {
      for (const [key, requests] of ipRequests.entries()) {
        const active = requests.filter(time => now - time < windowMs);
        if (active.length === 0) {
          ipRequests.delete(key);
        } else {
          ipRequests.set(key, active);
        }
      }
      lastCleanupTime = now;
    }

    if (!ipRequests.has(ip)) {
      ipRequests.set(ip, []);
    }

    const requests = ipRequests.get(ip);
    const activeRequests = requests.filter(time => now - time < windowMs);
    activeRequests.push(now);
    ipRequests.set(ip, activeRequests);

    if (activeRequests.length > limit) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.'
      });
    }

    next();
  };

  // Keep a dummy close method for compatibility with any callers
  middleware.close = () => {
    ipRequests.clear();
  };

  return middleware;
};

module.exports = rateLimit;
