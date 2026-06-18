import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

// Camera-based barcode scanner (works on mobile Safari + Android Chrome via getUserMedia).
// Calls onDetect(text) once a barcode is read, then the parent should close it.
export default function BarcodeScanner({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result, _err, ctrl) => {
            controlsRef.current = ctrl;
            if (result && active) {
              active = false;
              try { ctrl.stop(); } catch { /* noop */ }
              onDetectRef.current(result.getText());
            }
          }
        );
      } catch (e) {
        setError(e?.message || 'Unable to access the camera. Allow camera permission and use HTTPS.');
      }
    })();

    return () => {
      active = false;
      try { controlsRef.current?.stop(); } catch { /* noop */ }
    };
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 440, width: '94%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 12 }}>Scan Barcode</p>

        {error ? (
          <p style={{ color: 'var(--color-error)', fontSize: 13, padding: '24px 8px', lineHeight: 1.5 }}>{error}</p>
        ) : (
          <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} muted playsInline />
            <div style={{
              position: 'absolute', left: '12%', right: '12%', top: '32%', bottom: '32%',
              border: '2px solid var(--color-brand)', borderRadius: 8,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.30)'
            }} />
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>
          Point the rear camera at the barcode.
        </p>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
