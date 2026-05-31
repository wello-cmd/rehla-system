// Authorization Middleware — Role-Based Access Control (NFR-SC-06)
// Factory function: authorize('admin', 'ceo') returns middleware

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}.`
      });
    }

    next();
  };
}

module.exports = authorize;
