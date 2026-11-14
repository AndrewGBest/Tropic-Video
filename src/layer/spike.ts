// Phase 0 probes. They only observe: ask the browser whether Widevine is
// available through the standard EME API, and record what the page's video
// element does. They never inspect licence traffic or keys.
import type { BridgeMessage } from '../shared/actions';

const VIDEO_EVENTS = ['loadedmetadata', 'playing', 'waiting', 'stalled', 'pause', 'ended', 'encrypted'] as const;

export function installSpikeProbes(doc: Document, send: (m: BridgeMessage) => void): () => void {
  const view = doc.defaultView;
  if (!view) return () => undefined;

  const nav = view.navigator as Navigator;
  if (typeof nav.requestMediaKeySystemAccess === 'function') {
    nav
      .requestMediaKeySystemAccess('com.widevine.alpha', [
        {
          initDataTypes: ['cenc'],
          videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
          audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
        },
      ])
      .then(
        (access) => send({ kind: 'spike', event: { name: 'eme-access', ok: true, detail: access.keySystem } }),
        (err: unknown) => send({ kind: 'spike', event: { name: 'eme-access', ok: false, detail: String(err) } }),
      );
  } else {
    send({ kind: 'spike', event: { name: 'eme-access', ok: false, detail: 'EME API missing' } });
  }

  const onVideo = (e: Event): void => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement)) return;
    send({
      kind: 'spike',
      event: { name: 'video', event: e.type, width: v.videoWidth, height: v.videoHeight, currentTime: Math.round(v.currentTime) },
    });
  };
  const onError = (e: Event): void => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || !v.error) return;
    send({ kind: 'spike', event: { name: 'video-error', code: v.error.code, message: v.error.message } });
  };

  // Media events do not bubble, but they can be captured at the document.
  for (const name of VIDEO_EVENTS) doc.addEventListener(name, onVideo, true);
  doc.addEventListener('error', onError, true);
  return () => {
    for (const name of VIDEO_EVENTS) doc.removeEventListener(name, onVideo, true);
    doc.removeEventListener('error', onError, true);
  };
}
