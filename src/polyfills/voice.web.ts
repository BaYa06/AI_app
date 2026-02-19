/**
 * Web polyfill for @react-native-voice/voice
 * Uses the Web Speech API (SpeechRecognition / webkitSpeechRecognition)
 */

type Callback = (event: any) => void;

const getSpeechRecognition = (): any => {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
};

let recognition: any = null;
let _onSpeechResults: Callback | null = null;
let _onSpeechPartialResults: Callback | null = null;
let _onSpeechError: Callback | null = null;
let _onSpeechEnd: Callback | null = null;
let _onSpeechStart: Callback | null = null;

const Voice = {
  start: async (locale: string) => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      console.warn('[voice.web] SpeechRecognition not supported');
      if (_onSpeechError) _onSpeechError({ error: { message: 'Not supported' } });
      return;
    }

    // Abort previous instance to avoid duplicate listeners / "aborted" errors
    if (recognition) {
      try { recognition.onend = null; recognition.onerror = null; recognition.abort(); } catch {}
      recognition = null;
    }

    recognition = new SpeechRecognition();
    recognition.lang = locale;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const results = event.results;
      const lastResult = results[results.length - 1];

      if (lastResult.isFinal) {
        const alternatives: string[] = [];
        for (let i = 0; i < lastResult.length; i++) {
          alternatives.push(lastResult[i].transcript);
        }
        if (_onSpeechResults) _onSpeechResults({ value: alternatives });
      } else {
        const partial = lastResult[0]?.transcript || '';
        if (_onSpeechPartialResults) _onSpeechPartialResults({ value: [partial] });
      }
    };

    recognition.onerror = (event: any) => {
      if (_onSpeechError) _onSpeechError({ error: { message: event.error } });
    };

    recognition.onend = () => {
      if (_onSpeechEnd) _onSpeechEnd({});
    };

    recognition.onstart = () => {
      if (_onSpeechStart) _onSpeechStart({});
    };

    recognition.start();
  },

  stop: async () => {
    if (recognition) {
      recognition.stop();
      recognition = null;
    }
  },

  cancel: async () => {
    if (recognition) {
      recognition.abort();
      recognition = null;
    }
  },

  destroy: async () => {
    if (recognition) {
      recognition.abort();
      recognition = null;
    }
  },

  removeAllListeners: () => {
    _onSpeechResults = null;
    _onSpeechPartialResults = null;
    _onSpeechError = null;
    _onSpeechEnd = null;
    _onSpeechStart = null;
  },

  isAvailable: async () => !!getSpeechRecognition(),

  set onSpeechResults(cb: Callback | null) { _onSpeechResults = cb; },
  get onSpeechResults() { return _onSpeechResults; },

  set onSpeechPartialResults(cb: Callback | null) { _onSpeechPartialResults = cb; },
  get onSpeechPartialResults() { return _onSpeechPartialResults; },

  set onSpeechError(cb: Callback | null) { _onSpeechError = cb; },
  get onSpeechError() { return _onSpeechError; },

  set onSpeechEnd(cb: Callback | null) { _onSpeechEnd = cb; },
  get onSpeechEnd() { return _onSpeechEnd; },

  set onSpeechStart(cb: Callback | null) { _onSpeechStart = cb; },
  get onSpeechStart() { return _onSpeechStart; },
};

export default Voice;

export type SpeechResultsEvent = { value?: string[] };
export type SpeechErrorEvent = { error?: { message?: string } };
