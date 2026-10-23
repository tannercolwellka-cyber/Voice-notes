// Speech to text using the browser's built-in recognizer
// (Safari on iPhone, Chrome and Edge on Windows). No server or API key needed.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechSupported = Boolean(Recognition);

// Starts listening. onText(text) is called with the transcript so far, and
// onDone(text) once with the final transcript after listening ends.
// Returns stop(), which ends listening.
export function startListening(onText, onDone) {
  const rec = new Recognition();
  rec.lang = navigator.language || 'en-US';
  rec.continuous = true;
  rec.interimResults = true;

  let finished = '';   // text from earlier sessions (Safari stops after pauses)
  let current = '';    // text from the session running now
  let wantStop = false;

  rec.onresult = e => {
    current = Array.from(e.results, r => r[0].transcript).join('');
    onText((finished + ' ' + current).trim());
  };

  // Safari ends recognition on its own after a pause. Keep going until the user taps stop.
  rec.onend = () => {
    finished = (finished + ' ' + current).trim();
    current = '';
    if (wantStop) onDone(finished);
    else rec.start();
  };

  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      wantStop = true;
      alert('Microphone access was blocked. Allow it in your browser settings and try again.');
    }
  };

  rec.start();

  return () => {
    wantStop = true;
    rec.stop();
  };
}
