// In-Memory Rate Limiter Middleware
// Prevents brute-force / DDoS attacks on endpoints without external dependencies (NFR-RL-05 compliance)

const rateLimit = (limit = 100, windowMs = 15 * 60 * 1000) => {
  const ipRequests = new Map();

  // Periodically clean up old IP entries to prevent memory leaks
  const intervalId = setInterval(() => {
    const now = Date.now();
    for (const [ip, requests] of ipRequests.entries()) {
      const active = requests.filter(time => now - time < windowMs);
      if (active.length === 0) {
        ipRequests.delete(ip);
      } else {
        ipRequests.set(ip, active);
      }
    }
  }, windowMs);

  // Allow Node.js process to exit cleanly if this timer is the only thing remaining
  if (intervalId.unref) {
    intervalId.unref();
  }

  const middleware = (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();

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

  middleware.close = () => {
    clearInterval(intervalId);
  };

  return middleware;
};

module.exports = rateLimit;
