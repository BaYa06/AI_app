import { useCallback, useEffect, useRef } from 'react';
import {
  EMPTY_STATE,
  channelName,
  parseMessage,
  projectorUrl,
  supportsProjector,
  type ProjectorState,
} from './projector';

/**
 * Окно учителя ↔ окно проектора (Web 19). Состояние отправляется при каждом изменении и по запросу
 * «hello» (проектор только что открылся). Закрыли страницу учителя — проектор получает «closed».
 */
export function useProjector(sessionId: string, state: ProjectorState) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const channelRef = useRef<BroadcastChannel | null>(null);
  const supported = supportsProjector();

  useEffect(() => {
    if (!supported) return;
    const channel = new BroadcastChannel(channelName(sessionId));
    channelRef.current = channel;
    channel.onmessage = (ev) => {
      const msg = parseMessage(ev.data);
      if (msg?.type === 'hello') channel.postMessage({ type: 'state', state: stateRef.current });
    };
    const bye = () => channel.postMessage({ type: 'closed' });
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      bye();
      channel.close();
      channelRef.current = null;
    };
  }, [sessionId, supported]);

  useEffect(() => {
    channelRef.current?.postMessage({ type: 'state', state });
  }, [state]);

  const open = useCallback(() => {
    const w = window.open(
      projectorUrl(sessionId),
      'teach-projector',
      'popup=yes,width=1280,height=720'
    );
    w?.focus();
    return Boolean(w);
  }, [sessionId]);

  return { supported, open };
}

export { EMPTY_STATE };
