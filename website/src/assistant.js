import './assistant.css';
import { createVoice } from './voice.js';

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI (GPT)' },
  { id: 'claude', name: 'Claude' },
  { id: 'gemini', name: 'Gemini' },
];
const MODES = {
  chat: { label: 'Ask anything', placeholder: 'What’s on your mind?', helper: 'A question, a second opinion, or just a conversation.', example: 'Help me think of three thoughtful, low-cost birthday gifts for a friend who loves cooking.' },
  write: { label: 'Make a first draft', placeholder: 'What are we writing, and who is it for?', helper: 'Tell your AI the audience, tone, and what you want to say.', example: 'Write a warm, short thank-you note to a friend who helped me move. Keep it casual and specific.' },
  summarize: { label: 'Find the important bits', placeholder: 'Paste the text you’d like summarised…', helper: 'Paste text here and say how short you want the summary.', example: 'Summarise this in one sentence:\nOur community garden meets on Saturdays at 9am. New volunteers are welcome. Bring gloves; tools and water are provided. This week we are planting herbs.' },
  plan: { label: 'Make a simple plan', placeholder: 'What would you like to plan?', helper: 'A goal, your available time, and any constraints are a good start.', example: 'Help me plan a relaxed Sunday with two hours for chores, a walk, and time to cook. Give me a simple checklist.' },
  translate: { label: 'Say it another way', placeholder: 'Paste your text and name the target language…', helper: 'Include the language and whether it should sound formal or casual.', example: 'Translate into friendly, everyday Japanese: “Thank you for your help. I’m looking forward to seeing you next week.”' },
  explain: { label: 'Make it make sense', placeholder: 'What would you like explained?', helper: 'Choose a topic and tell your AI how much you already know.', example: 'Explain compound interest to a beginner using a simple example. Avoid jargon and show the steps.' },
};
const DEFAULT_LIMITS = { maxMessages: 20, maxMessageChars: 4000, maxTotalChars: 24000 };
const PHASES = { idle: 'Idle', listening: 'Listening', thinking: 'Waiting for reply', speaking: 'Speaking', stopped: 'Stopped', error: 'Needs a moment' };
const number = (value) => new Intl.NumberFormat().format(value);
const validTokens = (value) => Number.isSafeInteger(value) && value >= 0;

export function initAssistant() {
  const $ = (selector) => document.querySelector(selector);
  const root = $('#assistant-console');
  const draft = $('#chat-draft');
  const dialog = $('#connections-dialog');
  const codeInput = $('#access-code');
  const speakToggle = $('#speak-replies');
  // Deliberately no local/session storage for messages, drafts, codes, or tokens.
  const conversations = Object.fromEntries(PROVIDERS.map(({ id }) => [id, {
    messages: [], draft: '', mode: 'chat', replied: false, model: '', error: false,
  }]));
  const totals = { completed: 0, partial: 0, responses: 0, tokens: 0, reports: 0, missing: 0, duration: null };
  let selected = 'openai';
  let config = null;
  let configState = 'loading';
  let phase = 'idle';
  let notice = 'Checking this Mori’s connections…';
  let retryAvailable = false;
  let activeJob = null;
  let configJob = null;
  let sessionJob = null;
  let dialogTrigger = null;
  let voiceProvider = null;
  let pageHidden = false;
  const current = () => conversations[selected];
  const provider = (id = selected) => config?.providers.find((item) => item.id === id)
    || { ...PROVIDERS.find((item) => item.id === id), model: '', configured: false };
  const providerName = (id = selected) => PROVIDERS.find((item) => item.id === id).name;
  const limits = () => config?.limits || DEFAULT_LIMITS;
  const isBusy = () => ['listening', 'thinking', 'speaking'].includes(phase);
  const isReady = (id = selected) => navigator.onLine && configState === 'loaded'
    && config.auth.configured && provider(id).configured
    && (!config.auth.required || config.auth.authenticated);

  function readiness(id = selected) {
    if (!navigator.onLine) return 'Offline';
    if (configState === 'loading') return 'Checking setup';
    if (configState !== 'loaded') return 'Unavailable';
    if (!config.auth.configured || !provider(id).configured) return 'Needs setup';
    if (config.auth.required && !config.auth.authenticated) return 'Locked';
    if (conversations[id].error) return 'Check connection';
    return conversations[id].replied ? 'Replied this visit' : 'Ready to try';
  }

  function restingNotice() {
    if (!navigator.onLine) return 'You’re offline. Your draft is here; reconnect before sending.';
    if (configState === 'loading') return 'Checking this Mori’s connections…';
    if (configState === 'error') return 'AI connections couldn’t be loaded. Open Connections to try again. Your local world still works.';
    if (!config.auth.configured || !provider().configured) return 'This AI needs owner setup. Open Connections to see what’s needed.';
    if (config.auth.required && !config.auth.authenticated) return 'Unlock this Mori with the owner’s access code before talking or sending.';
    if (current().error) return `${providerName()} couldn’t complete its last request. You can retry your draft.`;
    if (current().replied) return `${providerName()} has replied this visit. Pick up where you left off.`;
    return `${providerName()} is ready for a first try. Ask a question to check the connection.`;
  }

  function renderMetrics() {
    $('#metric-model').textContent = current().model || provider().model || '—';
    $('#metric-readiness').textContent = `${providerName()} · ${readiness()}`;
    $('#metric-replies').textContent = number(totals.completed);
    $('#metric-reply-note').textContent = totals.partial
      ? `${number(totals.partial)} partial ${totals.partial === 1 ? 'reply' : 'replies'} not counted`
      : 'Across AIs · this visit';
    $('#metric-time').textContent = totals.duration === null ? '—'
      : totals.duration < 1000 ? `${Math.round(totals.duration)} ms` : `${(totals.duration / 1000).toFixed(1)} s`;
    $('#metric-tokens').textContent = !totals.responses ? '—'
      : !totals.reports ? 'Unknown' : `${number(totals.tokens)}${totals.missing ? '+' : ''}`;
    $('#metric-token-note').textContent = !totals.responses ? 'No replies yet'
      : totals.missing ? `Incomplete reporting · ${totals.missing} ${totals.missing === 1 ? 'reply' : 'replies'}`
        : 'Provider-reported · this visit';
  }

  function renderControls() {
    root.dataset.phase = phase;
    root.dataset.selectedProvider = selected;
    const ready = readiness();
    $('#assistant-readiness').textContent = ready;
    $('#assistant-readiness').dataset.ready = String(isReady());
    $('#voice-phase').textContent = PHASES[phase];
    $('#active-agent-name').textContent = providerName();
    $('#active-agent-model').textContent = current().model || provider().model || 'Model unavailable until setup is checked';
    $('#conversation-title').textContent = `A conversation with ${providerName()}`;
    $('#assistant-status').textContent = notice;
    $('#assistant-notice').dataset.error = String(phase === 'error');
    $('#assistant-retry').hidden = !retryAvailable || isBusy();
    // Keep Connections available while checking, and reserve its initial space.
    // Otherwise a late config result pushes a fresh /#inside anchor down.
    $('#assistant-setup').hidden = isReady();
    $('#assistant-stop').disabled = !isBusy();
    $('#voice-talk').disabled = !voice.canListen || isBusy();
    $('#type-instead').disabled = phase === 'thinking';
    // The supported-but-locked Talk/Send controls open Connections, not a mic.
    $('#send-message').disabled = isBusy() || !draft.value.trim();
    draft.readOnly = phase === 'thinking';
    $('#use-example').disabled = isBusy();
    draft.maxLength = limits().maxMessageChars;
    $('#draft-count').textContent = `${number(draft.value.length)} / ${number(limits().maxMessageChars)}`;
    $('#draft-count').dataset.over = String(draft.value.length > limits().maxMessageChars);
    const mode = MODES[current().mode];
    $('#draft-label').textContent = mode.label;
    $('#mode-helper').textContent = mode.helper;
    draft.placeholder = mode.placeholder;
    document.querySelectorAll('button[data-provider]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.provider === selected));
    });
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === current().mode));
      button.disabled = phase === 'thinking' || phase === 'listening';
    });
    renderMetrics();
    // An explicit UI boundary; companion state never owns the device screen.
    window.dispatchEvent(new CustomEvent('mori:assistant-state', {
      detail: { provider: providerName(), phase, readiness: ready },
    }));
  }

  function setPhase(next, message, retry = false) {
    phase = next;
    notice = message;
    retryAvailable = retry;
    renderControls();
  }

  function renderTranscript() {
    const transcript = $('#chat-transcript');
    const messages = [...current().messages];
    if (activeJob?.provider === selected) messages.push({ role: 'user', content: activeJob.text, pending: true });
    $('#chat-empty').hidden = messages.length > 0;
    $('#empty-guidance').textContent = isReady()
      ? 'Ask your own question, or choose an action and try an example. Nothing sends until you choose.'
      : 'Once your AI is connected, your questions and its replies will appear here.';
    const fragment = document.createDocumentFragment();
    messages.forEach((message) => {
      const entry = document.createElement('article');
      entry.className = `chat-message ${message.role}`;
      entry.dataset.role = message.role;
      const author = document.createElement('h4');
      author.textContent = message.role === 'user' ? 'You' : providerName();
      const content = document.createElement('p');
      // Model output and user text are always plain text, including any HTML.
      content.textContent = message.content;
      entry.append(author, content);
      if (message.partial || message.pending) {
        const note = document.createElement('small');
        note.textContent = message.partial ? 'Partial reply · the provider stopped before finishing' : 'Waiting for a reply…';
        entry.append(note);
      }
      fragment.append(entry);
    });
    transcript.replaceChildren(fragment);
    $('#chat-scroll').scrollTop = $('#chat-scroll').scrollHeight;
  }

  function renderConnections() {
    const list = document.createDocumentFragment();
    PROVIDERS.forEach(({ id, name }) => {
      const item = document.createElement('li');
      const text = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = name;
      const model = document.createElement('span');
      model.textContent = provider(id).model || 'Model not available';
      if (provider(id).transport === 'gateway') model.textContent += ' · via Vercel AI Gateway';
      text.append(title, model);
      const badge = document.createElement('span');
      badge.className = 'connection-badge';
      badge.textContent = readiness(id);
      item.append(text, badge);
      list.append(item);
    });
    $('#connection-list').replaceChildren(list);
    const ownerNeeded = configState === 'loaded'
      && (!config.auth.configured || !config.providers.some((item) => item.configured));
    const gatewayNames = config?.providers.filter((item) => item.configured && item.transport === 'gateway')
      .map((item) => item.name).join(', ');
    $('#connection-owner-note').textContent = config?.auth.configured && !provider().configured && gatewayNames
      ? `Gateway access for ${gatewayNames} does not include ${providerName()}. The owner needs a direct key or eligible, explicitly enabled Gateway access for this AI. No provider key goes in this page.`
      : 'The owner needs to enable AI access and add a provider on the server. There’s no key to paste here.';
    $('#connection-owner').hidden = !ownerNeeded && !(configState === 'loaded' && !provider().configured);
    $('#unlock-form').hidden = !(configState === 'loaded' && config.auth.configured && config.auth.required
      && !config.auth.authenticated && config.providers.some((item) => item.configured));
    $('#lock-access').hidden = !(configState === 'loaded' && config.auth.required && config.auth.authenticated);
    $('#refresh-connections').disabled = configState === 'loading' || Boolean(sessionJob);
    $('#unlock-submit').disabled = Boolean(sessionJob);
    $('#lock-access').disabled = Boolean(sessionJob);
    $('#connections-summary').textContent = !navigator.onLine ? 'You’re offline. Reconnect, then refresh connections.'
      : configState === 'loading' ? 'Checking this Mori’s AI setup…'
        : configState === 'error' ? 'We couldn’t reach this Mori’s AI service. Refresh to try again; the local companion still works.'
          : ownerNeeded ? 'This Mori is waiting for its AI connections.'
            : config.auth.required && !config.auth.authenticated ? 'AI access is locked. Have the owner’s code? You can unlock it here.'
              : 'Choose a configured AI and try a conversation. Setup alone does not verify a connection.';
  }

  function openConnections() {
    if (dialog.open) return;
    dialogTrigger = document.activeElement;
    if (isBusy()) stopAll({ message: 'Voice stopped while you check Connections. Your draft is kept.' });
    $('#unlock-status').textContent = '';
    renderConnections();
    dialog.showModal();
    if (!$('#unlock-form').hidden) codeInput.focus();
    else dialog.querySelector('[data-close-dialog]').focus();
  }

  function stopAll({ message = 'Stopped. Your draft is still here.', announce = true } = {}) {
    voiceProvider = null;
    voice.cancel();
    const job = activeJob;
    activeJob = null; // Invalidate first, even if an abort callback resolves later.
    if (job) {
      clearTimeout(job.timer);
      job.controller.abort();
      conversations[job.provider].draft = job.text;
      if (job.provider === selected) draft.value = job.text;
    }
    if (announce) setPhase('stopped', job
      ? 'Stopped here. The request may already have reached the provider. Your draft is kept.'
      : message);
    renderTranscript();
  }

  function requireReady() {
    if (isReady()) return true;
    setPhase(navigator.onLine ? 'idle' : 'error', restingNotice());
    openConnections();
    return false;
  }

  function validationError(text) {
    const messages = current().messages;
    if (!text) return 'Add a question or a little text first.';
    if (text.length > limits().maxMessageChars) return `Keep your message within ${number(limits().maxMessageChars)} characters. Your draft is kept.`;
    if (messages.length + 1 > limits().maxMessages) return 'This conversation has reached its message limit. Start a new conversation to continue.';
    if (messages.some((item) => item.content.length > limits().maxMessageChars)
      || messages.reduce((sum, item) => sum + item.content.length, text.length) > limits().maxTotalChars) {
      return 'This conversation is too long to send again. Start a new conversation, or shorten your draft.';
    }
    return '';
  }

  function apiError(response, data) {
    const code = data?.error?.code;
    if (response.status === 401 || code === 'AUTH_REQUIRED') {
      if (config) config.auth.authenticated = false;
      return 'Your AI access has expired or is locked. Open Connections to unlock, then send your draft again.';
    }
    if (code === 'SETUP_REQUIRED') {
      if (config) config.auth.configured = false;
      return 'This Mori needs owner setup before it can answer. Open Connections for the next step.';
    }
    if (code === 'PROVIDER_NOT_CONFIGURED' || response.status === 503) {
      if (config) provider().configured = false;
      return 'This AI needs setup by the owner. Open Connections; we won’t switch to another provider for you.';
    }
    if (response.status === 429) return 'This Mori or provider is receiving too many requests. Wait a moment, then retry your draft.';
    if (response.status === 403) return 'This request was blocked for this site. Try the owner’s Mori URL, or ask the owner to check access.';
    if (response.status === 400) return 'This message couldn’t be accepted. Shorten the draft or start a new conversation.';
    if (response.status === 504) return 'The AI took too long to answer. Your draft is kept; you can try again.';
    return 'The AI couldn’t complete a reply. Try again, or ask the owner to check this connection.';
  }

  function addUsage(usage) {
    let reported = null;
    if (validTokens(usage?.totalTokens)) reported = usage.totalTokens;
    else if (validTokens(usage?.inputTokens) && validTokens(usage?.outputTokens)) reported = usage.inputTokens + usage.outputTokens;
    if (reported !== null) {
      totals.tokens += reported;
      totals.reports++;
    } else {
      totals.missing++;
      // A reported component is useful, but is explicitly only a lower bound.
      const components = [usage?.inputTokens, usage?.outputTokens].filter(validTokens);
      if (components.length) {
        totals.tokens += components.reduce((a, b) => a + b, 0);
        totals.reports++;
      }
    }
  }

  async function sendMessage() {
    if (activeJob || phase === 'listening' || phase === 'speaking' || pageHidden) return;
    current().draft = draft.value;
    const text = draft.value.trim();
    if (!requireReady()) return;
    const problem = validationError(text);
    if (problem) {
      setPhase('error', problem);
      draft.focus({ preventScroll: true });
      return;
    }
    voice.cancel();
    const owner = current();
    const job = {
      provider: selected, text, mode: owner.mode, controller: new AbortController(),
      started: performance.now(), timedOut: false, timer: null,
    };
    activeJob = job;
    owner.error = false;
    owner.draft = '';
    draft.value = '';
    setPhase('thinking', `Asking ${providerName()}. Stop cancels waiting here.`);
    renderTranscript();
    job.timer = setTimeout(() => {
      if (activeJob !== job) return;
      job.timedOut = true;
      job.controller.abort();
    }, 30_000);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, signal: job.controller.signal,
        body: JSON.stringify({
          provider: job.provider, mode: job.mode,
          messages: [...owner.messages.map(({ role, content }) => ({ role, content })), { role: 'user', content: text }],
        }),
      });
      const data = await response.json().catch(() => null);
      if (activeJob !== job || selected !== job.provider || pageHidden) return;
      if (!response.ok) throw new Error(apiError(response, data));
      if (data?.provider !== job.provider || typeof data.reply !== 'string' || !data.reply.trim()
        || typeof data.model !== 'string' || !data.model.trim()) {
        throw new Error('The AI service returned an unreadable reply. Your draft is kept; try again.');
      }
      clearTimeout(job.timer);
      activeJob = null;
      owner.messages.push({ role: 'user', content: text }, { role: 'assistant', content: data.reply, partial: data.partial === true });
      owner.model = data.model;
      owner.replied = true;
      totals.responses++;
      if (data.partial === true) totals.partial++;
      else totals.completed++;
      totals.duration = Math.max(0, performance.now() - job.started);
      addUsage(data.usage);
      setPhase('idle', data.partial === true
        ? 'This reply was cut short. You can ask the same AI to continue; nothing is sent automatically.'
        : `${providerName()} replied. Keep going, or take a little pause.`);
      renderTranscript();
      renderConnections();
      if (speakToggle.checked && voice.canSpeak) voice.speak(data.reply);
    } catch (error) {
      if (activeJob !== job || selected !== job.provider || pageHidden) return;
      clearTimeout(job.timer);
      activeJob = null;
      owner.draft = text;
      owner.error = true;
      draft.value = text;
      const message = job.timedOut ? 'The AI took too long to answer. Your draft is kept; you can try again.'
        : error instanceof TypeError ? 'The connection dropped before a reply arrived. Check your network, then retry your draft.'
          : error.message || 'No completed reply arrived. Your draft is kept; please try again.';
      setPhase('error', message, true);
      renderTranscript();
      renderConnections();
    } finally {
      clearTimeout(job.timer);
    }
  }

  const voice = createVoice({
    onListening() {
      if (voiceProvider !== selected) return;
      setPhase('listening', 'Listening for one turn. Your words will be sent when you finish. Stop to keep editing.');
    },
    onDraft(text) {
      if (voiceProvider !== selected) return;
      draft.value = text;
      current().draft = text;
      renderControls();
    },
    onFinal(text) {
      if (voiceProvider !== selected || pageHidden) return;
      voiceProvider = null;
      draft.value = text;
      current().draft = text;
      setPhase('idle', 'Your words are ready.');
      void sendMessage();
    },
    onSpeaking() { setPhase('speaking', 'Reading the reply aloud. The microphone is off.'); },
    onIdle() { setPhase('idle', 'Your turn, whenever you’re ready. The microphone is off.'); },
    onError(message) {
      voiceProvider = null;
      setPhase('error', message);
    },
  });
  if (!voice.canListen) $('#voice-help').textContent = 'Voice input isn’t supported in this browser. Type your question here, or try a browser with speech recognition.';
  if (!voice.canSpeak) {
    speakToggle.checked = false;
    speakToggle.disabled = true;
  }
  $('#speech-support').textContent = [
    voice.canListen ? 'Browser speech may process audio off-device.' : '',
    !voice.canSpeak ? 'Read-aloud isn’t supported here; replies are still shown as text.' : '',
  ].filter(Boolean).join(' ');

  function startTalk() {
    if (isBusy() || pageHidden) return;
    if (!requireReady()) return;
    if (!voice.canListen) {
      setPhase('idle', 'This browser doesn’t support voice input. Type your question instead.');
      focusDraft();
      return;
    }
    voiceProvider = selected;
    current().draft = draft.value;
    setPhase('listening', 'Starting the microphone for one turn. Your final words will be sent.');
    voice.listen(draft.value);
  }

  function focusDraft() {
    draft.focus({ preventScroll: true });
    draft.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  function switchProvider(id) {
    if (id === selected || !conversations[id]) return;
    current().draft = draft.value;
    stopAll({ announce: false });
    selected = id;
    draft.value = current().draft;
    setPhase('idle', `${providerName()} selected. This AI has its own conversation. ${restingNotice()}`);
    renderTranscript();
    renderConnections();
  }

  function parseConfig(data) {
    if (!data?.auth || ['required', 'configured', 'authenticated'].some((key) => typeof data.auth[key] !== 'boolean')
      || !Array.isArray(data.providers)) throw new Error('Invalid configuration');
    const providers = PROVIDERS.map(({ id, name }) => {
      const item = data.providers.find((entry) => entry.id === id);
      if (!item || typeof item.configured !== 'boolean' || typeof item.model !== 'string') throw new Error('Invalid provider');
      return {
        id, name, model: item.model, configured: item.configured,
        transport: ['gateway', 'direct'].includes(item.transport) ? item.transport : null,
      };
    });
    const safeLimits = {};
    for (const key of Object.keys(DEFAULT_LIMITS)) {
      if (!Number.isSafeInteger(data.limits?.[key]) || data.limits[key] < 1) throw new Error('Invalid limits');
      safeLimits[key] = Math.min(data.limits[key], DEFAULT_LIMITS[key]);
    }
    return { auth: { ...data.auth }, providers, limits: safeLimits };
  }

  async function refreshConfig() {
    configJob?.abort();
    const controller = new AbortController();
    configJob = controller;
    configState = 'loading';
    renderControls();
    renderConnections();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch('/api/config', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) throw new Error('Configuration unavailable');
      const data = parseConfig(await response.json());
      if (configJob !== controller || pageHidden) return;
      config = data;
      configState = 'loaded';
    } catch {
      if (configJob !== controller || pageHidden) return;
      config = null;
      configState = 'error';
    } finally {
      clearTimeout(timer);
      if (configJob === controller && !pageHidden) {
        configJob = null;
        if (isBusy() && !isReady()) {
          stopAll({ announce: false });
          phase = 'idle';
        }
        if (!isBusy()) setPhase('idle', restingNotice());
        else renderControls();
        renderTranscript();
        renderConnections();
      }
    }
  }

  async function changeSession(method) {
    if (sessionJob) return;
    const code = method === 'POST' ? codeInput.value : null;
    if (method === 'POST' && !code?.trim()) return;
    if (method === 'DELETE') stopAll({ message: 'Stopping while AI access is locked.' });
    const controller = new AbortController();
    sessionJob = controller;
    $('#unlock-status').textContent = method === 'POST' ? 'Unlocking…' : 'Locking…';
    renderConnections();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      // The access code exists only in this request, never in storage or UI text.
      const request = fetch('/api/session', {
        method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        signal: controller.signal, ...(method === 'POST' ? { body: JSON.stringify({ code }) } : {}),
      });
      codeInput.value = '';
      const response = await request;
      const data = await response.json().catch(() => null);
      if (sessionJob !== controller || pageHidden) return;
      if (!response.ok || (method === 'POST' && data?.authenticated !== true)) {
        throw new Error(response.status === 429 ? 'Too many attempts. Wait a moment before trying again.'
          : response.status === 401 ? 'That code didn’t unlock this Mori. Check with the owner and try again.'
            : response.status === 503 ? 'AI access needs owner setup. Refresh connections for details.'
              : 'Couldn’t update AI access. Check your connection and try again.');
      }
      await refreshConfig();
      if (sessionJob !== controller || pageHidden) return;
      $('#unlock-status').textContent = method === 'POST'
        ? 'Access unlocked. Choose Talk or Send when you’re ready; nothing was sent automatically.'
        : 'AI access is locked. Chats remain in this tab until you clear them or leave.';
      if ($('#unlock-form').hidden) dialog.querySelector('[data-close-dialog]').focus();
    } catch (error) {
      if (sessionJob !== controller || pageHidden) return;
      $('#unlock-status').textContent = error.name === 'AbortError' || error instanceof TypeError
        ? 'Couldn’t reach the AI access service. Check your connection and try again.' : error.message;
    } finally {
      clearTimeout(timer);
      if (sessionJob === controller) {
        sessionJob = null;
        renderConnections();
      }
    }
  }

  document.querySelectorAll('[data-connections]').forEach((button) => button.addEventListener('click', openConnections));
  document.querySelectorAll('button[data-provider]').forEach((button) => button.addEventListener('click', () => switchProvider(button.dataset.provider)));
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
    current().mode = button.dataset.mode;
    renderControls();
  }));
  $('#voice-talk').addEventListener('click', startTalk);
  $('#type-instead').addEventListener('click', () => {
    if (phase === 'listening' || phase === 'speaking') stopAll({ message: 'Voice stopped. Type your question whenever you’re ready.' });
    focusDraft();
  });
  $('#assistant-stop').addEventListener('click', () => stopAll());
  $('#assistant-retry').addEventListener('click', () => { void sendMessage(); });
  $('#use-example').addEventListener('click', () => {
    draft.value = MODES[current().mode].example.slice(0, limits().maxMessageChars);
    current().draft = draft.value;
    setPhase('idle', 'An example, just in your draft. Edit it to make it yours, then choose Send.');
    draft.focus({ preventScroll: true });
  });
  $('#new-conversation').addEventListener('click', () => {
    stopAll({ announce: false });
    current().messages = [];
    current().draft = '';
    current().mode = 'chat';
    draft.value = '';
    setPhase('idle', `A fresh conversation with ${providerName()}. Other chats, your companion, and this visit’s metrics are unchanged.`);
    renderTranscript();
    draft.focus({ preventScroll: true });
  });
  draft.addEventListener('input', () => {
    if (phase === 'listening') stopAll({ message: 'Listening stopped so you can edit. Choose Send when you’re ready.' });
    current().draft = draft.value;
    renderControls();
  });
  draft.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void sendMessage();
    }
  });
  $('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); void sendMessage(); });
  speakToggle.addEventListener('change', () => {
    if (!speakToggle.checked && !['listening', 'thinking'].includes(phase)) {
      voice.cancel();
      if (phase === 'speaking') setPhase('idle', 'Read-aloud is off. Your reply is still here.');
    }
  });
  $('#unlock-form').addEventListener('submit', (event) => { event.preventDefault(); void changeSession('POST'); });
  $('#lock-access').addEventListener('click', () => { void changeSession('DELETE'); });
  $('#refresh-connections').addEventListener('click', () => { void refreshConfig(); });
  dialog.addEventListener('close', () => {
    codeInput.value = '';
    const pending = sessionJob;
    sessionJob = null;
    pending?.abort();
    if (dialogTrigger?.isConnected) dialogTrigger.focus({ preventScroll: true });
  });
  window.addEventListener('mori:assistant-action', (event) => {
    if (event.detail?.action === 'switch') {
      switchProvider(PROVIDERS[(PROVIDERS.findIndex((item) => item.id === selected) + 1) % PROVIDERS.length].id);
    } else if (event.detail?.action === 'stop') stopAll();
    else if (event.detail?.action === 'talk') {
      $('#talk').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      startTalk();
    }
  });
  window.addEventListener('offline', () => {
    stopAll({ announce: false });
    setPhase('error', 'You’re offline. Reconnect, then retry your draft.', Boolean(draft.value.trim()));
    renderConnections();
  });
  window.addEventListener('online', () => {
    setPhase('idle', 'You’re online again. Check Connections or send your draft when you’re ready.');
    renderConnections();
  });
  window.addEventListener('pagehide', () => {
    pageHidden = true;
    stopAll({ announce: false });
    configJob?.abort();
    configJob = null;
    sessionJob?.abort();
    sessionJob = null;
    codeInput.value = '';
  });
  window.addEventListener('pageshow', (event) => {
    pageHidden = false;
    if (event.persisted) {
      setPhase('stopped', 'Welcome back. The microphone is off.');
      void refreshConfig();
    }
  });
  renderControls();
  renderTranscript();
  void refreshConfig();
}
