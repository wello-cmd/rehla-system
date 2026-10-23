import { translate } from '../../i18n/index.js';
export default function LoadNotice({ error, loading, onRetry, stale = false }) {
  if (!error) return null;
  return <div className="dashboard-notice" role="status" style={{marginBottom:16}}><p>{translate(error)}{stale ? translate(" Previously loaded data is shown; it may be out of date.") : translate(" Data is unavailable, not zero.")}</p><button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={onRetry}>{translate("Retry")}</button></div>;
}
