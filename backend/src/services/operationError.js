function operationError(res, error) {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return res.status(503).json({ error: 'Database upgrade required. Ask an administrator to apply the pending migrations before retrying.' });
  }
  const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404
    : ['22023','22P02','22003','23514'].includes(error.code) ? 400
    : ['23505','40001','40P01'].includes(error.code) ? 409 : 500;
  if (status === 500) console.error('[Database operation]', error.message);
  return res.status(status).json({ error: status === 500 ? 'The operation could not be saved. Please retry.' : error.message });
}
module.exports = operationError;
