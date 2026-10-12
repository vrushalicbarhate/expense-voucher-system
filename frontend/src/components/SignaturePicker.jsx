import { useEffect, useRef, useState } from 'react';
import SecureImage from './SecureImage.jsx';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// Lets the person choose a signature image. Shows the new file, otherwise the
// signature that is already stored (existingPath), otherwise an empty state.
export default function SignaturePicker({ file, onChange, existingPath, savedPath, error, label = 'Signature' }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!TYPES.includes(f.type)) return setLocalError('Use a PNG, JPG or WEBP image.');
    if (f.size > MAX_BYTES) return setLocalError('Image must be under 2 MB.');
    setLocalError('');
    onChange(f);
  };

  const shown = error || localError;

  return (
    <div className="field">
      <label htmlFor="signature-input">{label}</label>
      <div className={`sig-box ${shown ? 'has-error' : ''}`}>
        {preview ? (
          <img src={preview} alt="Selected signature" className="sig-img" />
        ) : existingPath ? (
          <SecureImage path={existingPath} alt="Current signature" className="sig-img" />
        ) : savedPath ? (
          <SecureImage path={savedPath} alt="Your saved signature" className="sig-img" />
        ) : (
          <span className="muted">No signature yet</span>
        )}
      </div>
      <div className="row gap">
        <input id="signature-input" ref={inputRef} type="file" accept={TYPES.join(',')} onChange={pick} hidden />
        <button type="button" className="btn btn-quiet" onClick={() => inputRef.current.click()}>
          {preview || existingPath ? 'Replace image' : 'Upload image'}
        </button>
        {file && <button type="button" className="btn btn-quiet" onClick={() => onChange(null)}>Remove</button>}
      </div>
      {!preview && !existingPath && savedPath && <p className="hint">Your saved signature will be used unless you upload a new one.</p>}
      {shown && <p className="field-error">{shown}</p>}
    </div>
  );
}
