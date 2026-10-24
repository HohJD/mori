import './assistant.css';
import { createVoice } from './voice.js';

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'claude', name: 'Claude' },
  { id: 'gemini', name: 'Gemini' },
];
const MODES = {
  chat: { label: 'Ask anything', placeholder: 'Type a message…', helper: 'A question, a second opinion, or just a conversation.', example: 'Help me think of three thoughtful, low-cost birthday gifts for a friend who loves cooking.' },
  write: { label: 'Make a first draft', placeholder: 'What are we writing, and who is it for?', helper: 'Tell your AI the audience, tone, and what you want to say.', example: 'Write a warm, short thank-you note to a friend who helped me move. Keep it casual and specific.' },
  summarize: { label: 'Find the important bits', placeholder: 'Paste the text you’d like summarised…', helper: 'Paste text here and say how short you want the summary.', example: 'Summarise this in one sentence:\nOur community garden meets on Saturdays at 9am. New volunteers are welcome. Bring gloves; tools and water are provided. This week we are planting herbs.' },
  plan: { label: 'Make a simple plan', placeholder: 'What would you like to plan?', helper: 'A goal, your available time, and any constraints are a good start.', example: 'Help me plan a relaxed Sunday with two hours for chores, a walk, and time to cook. Give me a simple checklist.' },
  translate: { label: 'Say it another way', placeholder: 'Paste your text and name the target language…', helper: 'Include the language and whether it should sound formal or casual.', example: 'Translate into friendly, everyday Japanese: “Thank you for your help. I’m looking forward to seeing you next week.”' },
  explain: { label: 'Make it make sense', placeholder: 'What would you like explained?', helper: 'Choose a topic and tell your AI how much you already know.', example: 'Explain compound interest to a beginner using a simple example. Avoid jargon and show the steps.' },
};
const DEFAULT_LIMITS = { maxMessages: 20, maxMessageChars: 4000, maxTotalChars: 24000 };
const MODE_NAMES = { chat: 'Ask anything', write: 'Write', summarize: 'Summarise', plan: 'Plan', translate: 'Translate', explain: 'Explain' };
const number = (value) => new Intl.NumberFormat().format(value);
const validTokens = (value) => Number.isSafeInteger(value) && value >= 0;

export function initAssistant({ showTalk } = {}) {
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
  let notice = 'Checking connections…';
  let retryAvailable = false;
  let activeJob = null;
  let configJob = null;
  let sessionJob = null;
  let dialogTrigger = null;
  let voiceProvider = null;
  let pageHidden = false;
  let talkActive = true;
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
    if (!navigator.onLine) return 'You’re offline. Your draft is kept.';
    if (configState === 'loading') return 'Checking connections…';
    if (configState === 'error') return 'Couldn’t check AI setup. Try Settings.';
    if (!config.auth.configured || !provider().configured) return `${providerName()} needs owner setup.`;
    if (config.auth.required && !config.auth.authenticated) return 'Owner access needed.';
    if (current().error) return 'No reply yet. You can retry your draft.';
    if (current().replied) return 'Your turn, whenever you’re ready.';
    return 'Ready to try. What shall we think through?';
  }

  function renderMetrics() {
    $('#metric-model').textContent = current().model || provider().model || '—';
    $('#assistant-readiness').textContent = readiness();
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
    $('#assistant-status').textContent = notice;
    $('#assistant-notice').dataset.error = String(phase === 'error');
    $('#assistant-retry').hidden = !retryAvailable || isBusy();
    $('#assistant-setup').hidden = configState === 'loading' || isReady();
    $('#setup-label').textContent = configState === 'loaded' && config.auth.configured
      && config.auth.required && !config.auth.authenticated
      && config.providers.some((item) => item.configured) ? 'Unlock Mori' : 'Settings';
    $('#assistant-stop').disabled = !isBusy();
    const returnFromStop = document.activeElement === $('#assistant-stop') && !isBusy();
    $('#assistant-stop').hidden = !isBusy();
    $('#voice-talk').disabled = !voice.canListen || isBusy();
    // The supported-but-locked Talk/Send controls open Connections, not a mic.
    $('#send-message').disabled = isBusy() || !draft.value.trim();
    draft.readOnly = phase === 'thinking';
    $('#use-example').disabled = isBusy();
    draft.maxLength = limits().maxMessageChars;
    $('#draft-count').textContent = `${number(draft.value.length)} / ${number(limits().maxMessageChars)}`;
    $('#draft-count').dataset.over = String(draft.value.length > limits().maxMessageChars);
    const mode = MODES[current().mode];
    $('#draft-label').textContent = mode.label;
    $('#composer-mode').textContent = MODE_NAMES[current().mode];
    $('#mode-helper').textContent = mode.helper;
    const extraMode = ['translate', 'explain'].includes(current().mode);
    $('#more-shortcuts').dataset.active = String(extraMode);
    $('#more-label').textContent = extraMode ? MODE_NAMES[current().mode] : 'More';
    draft.placeholder = mode.placeholder;
    document.querySelectorAll('button[data-provider]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.provider === selected));
    });
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === current().mode));
      button.disabled = phase === 'thinking' || phase === 'listening';
    });
    renderMetrics();
    if (returnFromStop && talkActive && !pageHidden) {
      (voice.canListen ? $('#voice-talk') : draft).focus({ preventScroll: true });
    }
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
    $('#chat-scroll').hidden = messages.length === 0;
    root.dataset.hasConversation = String(messages.length > 0);
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
      : configState === 'loading' ? 'Checking AI setup…'
        : configState === 'error' ? 'We couldn’t reach the AI service. Refresh connections to try again.'
          : ownerNeeded ? 'This Mori is waiting for its AI connections.'
            : config.auth.required && !config.auth.authenticated ? 'Have the owner’s code? Unlock your AI here.'
              : 'Your space, your preferences. Connection details are below.';
  }

  function openConnections() {
    if (dialog.open) return;
    dialogTrigger = document.activeElement;
    if (isBusy()) stopAll({ message: 'Stopped while you check Settings. Your draft is kept.' });
    $('#unlock-status').textContent = '';
    renderConnections();
    if (!isReady() && $('#unlock-form').hidden) $('#connection-details').open = true;
    dialog.showModal();
    if (!$('#unlock-form').hidden) codeInput.focus();
    else dialog.querySelector('[data-close-dialog]').focus();
  }

  function stopAll({ message = 'Stopped. Your draft is kept.', announce = true } = {}) {
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
      ? 'Stopped here. Your draft is kept.'
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
      return 'AI access has expired or is locked. Unlock Mori, then send again.';
    }
    if (code === 'SETUP_REQUIRED') {
      if (config) config.auth.configured = false;
      return 'Mori needs owner setup. See Settings for the next step.';
    }
    if (code === 'PROVIDER_NOT_CONFIGURED' || response.status === 503) {
      if (config) provider().configured = false;
      return 'This AI needs owner setup. Your draft is kept; no provider was switched.';
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
    if (activeJob || phase === 'listening' || phase === 'speaking' || pageHidden || !talkActive) return;
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
    setPhase('thinking', `Asking ${providerName()}…`);
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
      if (activeJob !== job || selected !== job.provider || pageHidden || !talkActive) return;
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
        ? 'A partial reply. Ask to continue when you’re ready.'
        : 'Your turn, whenever you’re ready.');
      renderTranscript();
      renderConnections();
      if (speakToggle.checked && voice.canSpeak) voice.speak(data.reply);
    } catch (error) {
      if (activeJob !== job || selected !== job.provider || pageHidden || !talkActive) return;
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
      if (voiceProvider !== selected || !talkActive) return;
      setPhase('listening', 'Listening… finish to send, or Stop to edit.');
    },
    onDraft(text) {
      if (voiceProvider !== selected || !talkActive) return;
      draft.value = text;
      current().draft = text;
      renderControls();
    },
    onFinal(text) {
      if (voiceProvider !== selected || pageHidden || !talkActive) return;
      voiceProvider = null;
      draft.value = text;
      current().draft = text;
      setPhase('idle', 'Your words are ready.');
      void sendMessage();
    },
    onSpeaking() { setPhase('speaking', 'Reading aloud · microphone off.'); },
    onIdle() { setPhase('idle', 'Your turn · microphone off.'); },
    onError(message) {
      voiceProvider = null;
      setPhase('error', message);
    },
  });
  if (!voice.canListen) $('#voice-help').textContent = 'Voice isn’t supported here. Typing works below.';
  if (!voice.canSpeak) {
    speakToggle.checked = false;
    speakToggle.disabled = true;
  }
  $('#speech-support').textContent = [
    voice.canListen ? 'Browser speech may process audio off-device.' : '',
    !voice.canSpeak ? 'Read-aloud isn’t supported here; replies are still shown as text.' : '',
  ].filter(Boolean).join(' ');

  function startTalk() {
    if (isBusy() || pageHidden || !talkActive) return;
    if (!requireReady()) return;
    if (!voice.canListen) {
      setPhase('idle', 'This browser doesn’t support voice input. Type your question instead.');
      focusDraft();
      return;
    }
    voiceProvider = selected;
    current().draft = draft.value;
    setPhase('listening', 'Starting the microphone… one turn, then send.');
    voice.listen(draft.value);
  }

  function focusDraft() {
    draft.focus({ preventScroll: true });
  }

  function switchProvider(id) {
    if (id === selected || !conversations[id]) return;
    current().draft = draft.value;
    stopAll({ announce: false });
    selected = id;
    draft.value = current().draft;
    setPhase('idle', restingNotice());
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
    $('#more-shortcuts').open = false;
    renderControls();
    draft.focus({ preventScroll: true });
  }));
  $('#voice-talk').addEventListener('click', startTalk);
  $('#assistant-stop').addEventListener('click', () => stopAll());
  $('#assistant-retry').addEventListener('click', () => { void sendMessage(); });
  $('#use-example').addEventListener('click', () => {
    draft.value = MODES[current().mode].example.slice(0, limits().maxMessageChars);
    current().draft = draft.value;
    $('#more-shortcuts').open = false;
    setPhase('idle', 'An example to make yours. Edit, then Send.');
    draft.focus({ preventScroll: true });
  });
  $('#new-conversation').addEventListener('click', () => {
    stopAll({ announce: false });
    current().messages = [];
    current().draft = '';
    current().mode = 'chat';
    draft.value = '';
    setPhase('idle', `A fresh conversation with ${providerName()}.`);
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
    if (dialogTrigger?.isConnected && !dialogTrigger.closest('[hidden], [inert]')) dialogTrigger.focus({ preventScroll: true });
  });
  window.addEventListener('mori:assistant-action', (event) => {
    if (event.detail?.action === 'switch') {
      switchProvider(PROVIDERS[(PROVIDERS.findIndex((item) => item.id === selected) + 1) % PROVIDERS.length].id);
    } else if (event.detail?.action === 'stop') stopAll();
    else if (event.detail?.action === 'talk') {
      // Keep the original device's Talk a direct gesture, but never record in
      // its hidden chat view. Navigate synchronously before invoking speech.
      showTalk?.();
      $('#voice-talk').focus({ preventScroll: true });
      startTalk();
    }
  });
  window.addEventListener('offline', () => {
    stopAll({ announce: false });
    setPhase('error', 'You’re offline. Reconnect, then retry your draft.', Boolean(draft.value.trim()));
    renderConnections();
  });
  window.addEventListener('online', () => {
    setPhase('idle', 'You’re online again. Send when you’re ready.');
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
  return {
    setActive(active) {
      talkActive = active;
      if (active) return; // Returning never sends, clears, or restarts voice.
      current().draft = draft.value;
      stopAll({ message: 'Stopped while you were away. Your draft is kept.', announce: isBusy() });
    },
  };
}
