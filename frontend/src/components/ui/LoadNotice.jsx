export default function LoadNotice({ error, loading, onRetry, stale = false }) {
  if (!error) return null;
  return <div className="dashboard-notice" role="status" style={{marginBottom:16}}><p>{error}{stale ? ' Previously loaded data is shown; it may be out of date.' : ' Data is unavailable, not zero.'}</p><button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={onRetry}>Retry</button></div>;
}
