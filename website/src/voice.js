// Native, one-turn browser speech. No microphone is requested during creation.
// Cancellation invalidates callbacks before touching the browser interfaces.
export function createVoice({ onListening, onDraft, onFinal, onSpeaking, onIdle, onError }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synthesis = window.speechSynthesis;
  const canListen = typeof Recognition === 'function';
  const canSpeak = Boolean(synthesis && typeof window.SpeechSynthesisUtterance === 'function');
  let generation = 0;
  let recognition = null;
  let utterance = null;
  let endTimer;

  function stopRecognition() {
    clearTimeout(endTimer);
    if (!recognition) return;
    const previous = recognition;
    recognition = null;
    previous.onstart = previous.onresult = previous.onerror = previous.onend = null;
    try { previous.abort(); } catch { /* Already ended. */ }
  }

  function cancel() {
    generation++;
    stopRecognition();
    if (utterance) {
      utterance.onstart = utterance.onend = utterance.onerror = null;
      utterance = null;
    }
    if (canSpeak) {
      try { synthesis.cancel(); } catch { /* Keep typing available. */ }
    }
  }

  function listen(prefix = '') {
    cancel();
    if (!canListen) return false;
    const turn = generation;
    let finalText = '';
    const join = (text) => [prefix.trim(), text.trim()].filter(Boolean).join('\n');
    let current;
    try { current = new Recognition(); } catch {
      onError('Voice couldn’t start in this browser. You can still type your question.', 'start');
      return false;
    }
    recognition = current;
    current.lang = navigator.language || document.documentElement.lang || 'en';
    current.continuous = false;
    current.interimResults = true;
    current.maxAlternatives = 1;
    const isCurrent = () => turn === generation && recognition === current;

    const finish = () => {
      if (!isCurrent()) return;
      stopRecognition();
      if (finalText.trim()) onFinal(join(finalText));
      else onError('No words were heard. Try Talk again, or type your question.', 'no-speech');
    };
    current.onstart = () => { if (isCurrent()) onListening(); };
    current.onresult = (event) => {
      if (!isCurrent()) return;
      let interim = '';
      finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || '';
        if (result.isFinal) finalText += `${text} `;
        else interim += `${text} `;
      }
      onDraft(join(`${finalText}${interim}`));
      if (finalText.trim()) {
        // End the microphone BEFORE handing the final draft to the chat flow.
        // Some implementations never emit onend after stop; bound that wait.
        clearTimeout(endTimer);
        endTimer = setTimeout(finish, 1500);
        try { current.stop(); } catch { finish(); }
      }
    };
    current.onend = finish;
    current.onerror = (event) => {
      if (!isCurrent()) return;
      const messages = {
        'not-allowed': 'Microphone permission was denied. You can allow it in browser settings, or just type.',
        'service-not-allowed': 'This browser has blocked speech recognition. Typing still works.',
        'audio-capture': 'No microphone is available. Check your microphone, or type your question.',
        'no-speech': 'No words were heard. Try Talk again, or type your question.',
        network: 'The browser’s speech service could not connect. Try again when online, or type instead.',
        aborted: 'Listening stopped. Your draft is still here.',
        'language-not-supported': 'Speech recognition does not support this browser language. You can type instead.',
      };
      stopRecognition();
      onError(messages[event.error] || 'Voice couldn’t start in this browser. You can still type your question.', event.error);
    };
    try {
      current.start();
      return true;
    } catch {
      stopRecognition();
      onError('Voice couldn’t start. Check browser microphone permission, or type instead.', 'start');
      return false;
    }
  }

  function speak(text) {
    cancel();
    if (!canSpeak) return false;
    const turn = generation;
    let current;
    try { current = new window.SpeechSynthesisUtterance(text); } catch {
      onError('Read-aloud isn’t available right now. The text reply is still here.', 'synthesis');
      return false;
    }
    utterance = current;
    current.lang = navigator.language || document.documentElement.lang || 'en';
    const isCurrent = () => generation === turn && utterance === current;
    current.onstart = () => { if (isCurrent()) onSpeaking(); };
    current.onend = () => {
      if (!isCurrent()) return;
      utterance = null;
      onIdle();
    };
    current.onerror = () => {
      if (!isCurrent()) return;
      utterance = null;
      onError('The reply is here, but this browser couldn’t read it aloud. You can read it below.', 'synthesis');
    };
    try {
      synthesis.speak(current);
      return true;
    } catch {
      utterance = null;
      onError('Read-aloud isn’t available right now. The text reply is still here.', 'synthesis');
      return false;
    }
  }

  return { canListen, canSpeak, listen, speak, cancel };
}
