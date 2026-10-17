// Keep the submitted sale stable across an uncertain network outcome. A changed
// payload or a completed sale starts a new server-side idempotency scope.
export function prepareCheckoutAttempt(previous, payload) {
  const fingerprint = JSON.stringify(payload);
  if (previous?.fingerprint === fingerprint) return previous;
  return {
    fingerprint,
    payload: { ...JSON.parse(fingerprint), idempotency_key: crypto.randomUUID() },
  };
}
