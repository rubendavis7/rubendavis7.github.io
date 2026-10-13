// Voice providers (replaceable). Transcription and speech are separate
// providers chosen on the Connections page; "none" is the default and voice is
// shown as unavailable until one is configured AND works in this browser.
// To add a provider (for example a local Whisper server), add an entry with
// the same shape: { label, supported(), listen(opts) } or { label, supported(), speak(text, opts) }.
(function () {
  'use strict';
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function localVoices() {
    if (!('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices().filter((v) => v.localService && /^en/i.test(v.lang));
  }

  function waitForVoices(ms = 1200) {
    return new Promise((resolve) => {
      if (localVoices().length) return resolve(localVoices());
      const done = () => resolve(localVoices());
      window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, ms);
    });
  }

  const transcription = {
    browser: {
      label: 'Browser speech recognition (cloud)',
      supported: () => Boolean(SR),
      listen({ lang = 'en-US', timeoutMs = 10000, onStart = () => {}, onEnd = () => {} } = {}) {
        return new Promise((resolve, reject) => {
          if (!SR) return reject(new Error('This browser has no speech recognition.'));
          const rec = new SR();
          rec.lang = lang;
          rec.interimResults = false;
          rec.maxAlternatives = 1;
          rec.continuous = false;
          let settled = false;
          const finish = (fn, v) => { if (!settled) { settled = true; fn(v); } };
          const timer = setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } }, timeoutMs);
          rec.onstart = onStart;
          rec.onresult = (e) => finish(resolve, String(e.results[0][0].transcript || '').trim());
          rec.onerror = (e) => {
            const map = { 'not-allowed': 'Microphone permission was denied.', 'service-not-allowed': 'Speech recognition is blocked in this browser.', network: 'The browser speech service could not be reached.', 'no-speech': 'No speech was heard.', 'audio-capture': 'No microphone was found.' };
            finish(reject, new Error(map[e.error] || `Speech recognition error: ${e.error}`));
          };
          rec.onend = () => { clearTimeout(timer); onEnd(); finish(reject, new Error('No speech was heard.')); };
          try { rec.start(); } catch (err) { clearTimeout(timer); finish(reject, err); }
        });
      },
    },
  };

  const speech = {
    browser: {
      label: 'Browser voices (this computer only)',
      supported: () => 'speechSynthesis' in window,
      async speak(text, { onStart = () => {}, onEnd = () => {} } = {}) {
        const voices = await waitForVoices();
        if (!voices.length) throw new Error('No local English voice is installed on this computer.');
        return new Promise((resolve, reject) => {
          const u = new SpeechSynthesisUtterance(String(text).slice(0, 1500));
          u.voice = voices[0];
          u.rate = 1.02;
          u.onstart = onStart;
          u.onend = () => { onEnd(); resolve(); };
          u.onerror = (e) => { onEnd(); reject(new Error(`Speech failed: ${e.error}`)); };
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        });
      },
      stop() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); },
    },
  };

  window.BDOSVoice = {
    providers: { transcription, speech },
    get(kind, id) { return (kind === 'transcription' ? transcription : speech)[id] || null; },
    // Usable = configured on the server AND supported in this browser.
    usable(kind, configured) {
      const p = this.get(kind, configured);
      return Boolean(p && p.supported());
    },
  };
})();
