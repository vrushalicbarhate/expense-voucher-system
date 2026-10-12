import { useEffect, useState } from 'react';
import api from '../api';

// Signatures are served from authenticated endpoints, so <img src> can't be used
// directly (it would not send the JWT). Fetch as a blob and show an object URL.
export default function SecureImage({ path, alt, className }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url;
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    api.get(path, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        url = URL.createObjectURL(res.data);
        setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  if (failed) return <span className="muted">Signature unavailable</span>;
  if (!src) return <span className="sig-skeleton" aria-label="Loading signature" />;
  return <img src={src} alt={alt} className={className} />;
}
