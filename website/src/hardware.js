import { hardwareParts } from './hardware-parts.js';
import { createHardwareFallback } from './hardware-fallback.js';

const numbered = (index) => String(index + 1).padStart(2, '0');
const clamp = (value) => Math.min(1, Math.max(0, value));

export function initHardware(reducedMotion) {
  const section = document.querySelector('#inside');
  const find = (selector) => section.querySelector(selector);
  const stage = find('.hardware-studio');
  const viewport = find('.hardware-viewport');
  const index = find('.hardware-part-index');
  const select = find('#hardware-part-select');
  const scrub = find('#hardware-scrub');
  const markerMount = find('.hardware-markers');
  const isolateButton = find('[data-isolate]');
  const compact = window.matchMedia('(max-height: 699px), (max-width: 900px) and (max-height: 779px)');
  const values = Object.fromEntries(hardwareParts.map(({ id }) => [id, 0]));
  // GSAP attaches a cache to its targets; only component values are pose data.
  const separations = () => hardwareParts.map(({ id }) => values[id]);
  const fallback = createHardwareFallback(find('.hardware-fallback'));
  const abort = new AbortController();
  const listen = (target, event, handler) => target.addEventListener(event, handler, { signal: abort.signal });
  let selected = hardwareParts[0].id;
  let progress = 0, isolated = false, isolatedAt = 0;
  let model, gsap, ScrollTrigger, timeline, trigger, loadPromise;
  let visible = false, frame = null, resize = true, destroyed = false, importFailed = false;
  let shell = document.body.dataset.shell;
  let theme = document.documentElement.dataset.theme;
  const markers = new Map();

  hardwareParts.forEach((part, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.part = part.id;
    button.textContent = numbered(i);
    button.title = `${numbered(i)} — ${part.name}`;
    button.setAttribute('aria-label', `Inspect ${numbered(i)}: ${part.name}`);
    button.setAttribute('aria-pressed', String(i === 0));
    index.append(button);
    const option = document.createElement('option');
    option.value = part.id;
    option.textContent = `${numbered(i)} / ${part.name}`;
    select.append(option);
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'hardware-marker';
    marker.dataset.marker = part.id;
    marker.setAttribute('aria-label', `Locate ${numbered(i)}: ${part.name}`);
    marker.setAttribute('aria-pressed', String(i === 0));
    // All inserted content here is fixed, application-owned metadata.
    marker.innerHTML = `<span>${numbered(i)}</span><span class="hardware-marker-name">${part.name}</span>`;
    marker.hidden = true;
    markerMount.append(marker);
    markers.set(part.id, marker);
  });

  function updateDetail() {
    const part = hardwareParts.find(({ id }) => id === selected);
    const i = hardwareParts.indexOf(part);
    select.value = part.id;
    find('[data-part-category]').textContent = `${numbered(i)} / ${part.category}`;
    find('[data-part-title]').textContent = part.name;
    find('[data-part-description]').textContent = part.description;
    find('[data-part-material]').textContent = part.material;
    index.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.part === selected)));
    markers.forEach((marker, id) => marker.setAttribute('aria-pressed', String(id === selected)));
    section.dataset.selected = selected;
  }
  function setIsolated(next) {
    isolated = next;
    isolatedAt = progress;
    isolateButton.setAttribute('aria-pressed', String(next));
    isolateButton.innerHTML = next ? 'See all parts <span aria-hidden="true">↙</span>' : 'Look closer <span aria-hidden="true">↗</span>';
    schedule();
  }
  function updateInterface() {
    const spread = Math.max(...separations());
    const phase = spread < .001 ? 'assembled' : spread > .999 && progress > .40 && progress < .70 ? 'exploded' : progress < .5 ? 'opening' : 'closing';
    const chapter = progress < .08 ? '01 — A familiar little shape'
      : progress < .41 ? '02 — A world opening up'
        : progress < .70 ? '03 — Every little part'
          : progress < .96 ? '04 — Back together' : '05 — A little world, whole again';
    find('[data-hardware-chapter]').textContent = chapter;
    find('[data-view-caption]').textContent = isolated ? 'A closer look. A proposed little detail.'
      : phase === 'exploded' ? '16 proposed subsystems. One little personality.'
        : phase === 'assembled' ? 'One small world, held together.' : 'A little curiosity goes a long way.';
    section.dataset.phase = phase;
    section.dataset.progress = progress.toFixed(4);
    section.dataset.separation = spread.toFixed(4);
    scrub.value = String(Math.round(progress * 1000));
    scrub.style.setProperty('--story-progress', `${(progress * 100).toFixed(2)}%`);
    scrub.setAttribute('aria-valuetext', `${Math.round(progress * 100)} percent. ${chapter.slice(5)}.`);
    find('[data-hardware-view="assembled"]').setAttribute('aria-pressed', String(spread < .001));
    find('[data-hardware-view="exploded"]').setAttribute('aria-pressed', String(phase === 'exploded'));
    if (isolated && Math.abs(progress - isolatedAt) > .025) setIsolated(false);
    schedule();
  }
  function render() {
    frame = null;
    if (destroyed || !visible || document.hidden) return;
    let positions;
    if (model) {
      if (resize) model.resize();
      model.setPose(values);
      model.setSelection(selected, isolated);
      positions = model.render();
    } else {
      positions = fallback.render(values, selected, isolated);
    }
    resize = false;
    if (!positions) return;
    const width = viewport.clientWidth, height = viewport.clientHeight;
    const spread = Math.max(...separations());
    // Five navigation landmarks, plus the chosen component: never 16 colliding labels.
    const landmarks = new Set(['enclosure', 'display', 'pcb', 'battery', 'rear']);
    for (const [id, marker] of markers) {
      const position = positions[id];
      const shown = isolated ? id === selected : spread < .5 ? false : id === selected || landmarks.has(id);
      marker.hidden = !shown;
      if (!shown || !position) continue;
      const x = Math.min(width - 28, Math.max(28, position.x));
      const anchorY = id === selected ? position.top - 10 : position.y - 25;
      const y = Math.min(height - 48, Math.max(29, anchorY));
      marker.style.transform = `translate(${(x - 22).toFixed(1)}px, ${(y - 22).toFixed(1)}px)`;
      const labelWidth = id === selected ? marker.lastElementChild.getBoundingClientRect().width : 0;
      marker.dataset.align = x + 16 + labelWidth < width - 10 ? 'left'
        : x - 16 - labelWidth > 10 ? 'right' : 'center';
    }
  }
  function schedule() {
    if (visible && !document.hidden && frame === null && !destroyed) frame = requestAnimationFrame(render);
  }
  function updateMode() {
    section.dataset.motion = reducedMotion.matches ? 'reduced' : compact.matches ? 'compact' : importFailed ? 'static' : 'scroll';
    find('[data-hardware-instruction]').textContent = reducedMotion.matches
      ? 'Reduced motion · a still study, at your pace.'
      : compact.matches ? 'Compact studio · use the view controls to explore.'
        : importFailed ? 'Illustrated study · all components are still inspectable.'
          : 'Keep scrolling. It all comes back together.';
  }
  function configureTimeline() {
    trigger?.kill(); trigger = null;
    timeline?.kill(); timeline = null;
    updateMode();
    if (!gsap) {
      if (section.dataset.motion !== 'scroll') {
        progress = .5;
        hardwareParts.forEach(({ id }) => { values[id] = 1; });
      }
      updateInterface();
      return;
    }
    timeline = gsap.timeline({
      paused: true,
      onUpdate() { progress = timeline.progress(); updateInterface(); },
    });
    // An explicit one-unit duration keeps closed rests at BOTH ends. Each
    // subsystem has absolute, reversible transforms, never accumulated rotation.
    timeline.to({}, { duration: 1 }, 0);
    hardwareParts.forEach(({ id }, i) => {
      timeline.fromTo(values, { [id]: 0 }, { [id]: 1, duration: .20, ease: 'power2.inOut', immediateRender: false }, .10 + i * .007);
      timeline.to(values, { [id]: 0, duration: .20, ease: 'power2.inOut' }, .70 + (hardwareParts.length - 1 - i) * .004);
    });
    if (section.dataset.motion === 'scroll') {
      trigger = ScrollTrigger.create({
        id: 'mori-hardware',
        trigger: section,
        animation: timeline,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        invalidateOnRefresh: true,
        onRefresh(self) {
          section.dataset.scrollStart = self.start.toFixed(2);
          section.dataset.scrollEnd = self.end.toFixed(2);
        },
      });
      // Safe refresh waits for native anchor/momentum scrolling to finish.
      ScrollTrigger.refresh(true);
    } else {
      timeline.progress(.5);
    }
    section.dataset.triggerCount = String(ScrollTrigger.getAll().filter((item) => item.vars.id === 'mori-hardware').length);
    resize = true;
    updateInterface();
  }
  function seek(value) {
    const target = clamp(value);
    if (timeline) {
      // Native scroll, instant seeking only on explicit controls. No wheel/touch
      // interception, synthetic scroll container, or scroll-jacking.
      if (trigger) window.scrollTo({ top: trigger.start + (trigger.end - trigger.start) * target, behavior: 'instant' });
      timeline.progress(target);
    } else {
      progress = target;
      const t = target < .4 ? clamp((target - .1) / .3) : target < .7 ? 1 : 1 - clamp((target - .7) / .26);
      hardwareParts.forEach(({ id }) => { values[id] = t; });
      updateInterface();
    }
  }
  function choose(id) {
    if (!hardwareParts.some((part) => part.id === id)) return;
    if (Math.min(...separations()) < .99) seek(.5);
    selected = id;
    updateDetail();
    schedule();
    load();
  }
  function useFallback() {
    model?.dispose();
    model = null;
    section.dataset.renderer = 'fallback';
    find('[data-render-label]').textContent = 'Illustrated view · 3D unavailable';
    viewport.setAttribute('aria-label', 'MORI detailed illustrated hardware fallback. All 16 proposed components are available in the inspector.');
    fallback.setShell(shell);
    schedule();
  }
  async function load() {
    if (loadPromise || destroyed) return loadPromise;
    loadPromise = (async () => {
      try {
        // The hero never pays the WebGL/animation download cost. Even with a
        // failed import, the already-mounted vector study and inspector survive.
        const [sceneModule, animationModule, scrollModule] = await Promise.all([
          import('./hardware-model.js'), import('gsap'), import('gsap/ScrollTrigger'),
        ]);
        if (destroyed) return;
        gsap = animationModule.gsap;
        ScrollTrigger = scrollModule.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);
        try {
          await document.fonts.ready;
          if (destroyed) return;
          model = sceneModule.createHardwareScene(find('.hardware-canvas'), { onContextLost: useFallback });
          section.dataset.renderer = 'webgl';
          find('[data-render-label]').textContent = 'Interactive 3D study';
          model.setShell(shell);
          model.setTheme(theme);
        } catch {
          useFallback();
        }
        configureTimeline();
      } catch {
        if (destroyed) return;
        importFailed = true;
        useFallback();
        configureTimeline();
      }
    })();
    return loadPromise;
  }

  listen(index, 'click', (event) => {
    const button = event.target.closest('[data-part]');
    if (button) choose(button.dataset.part);
  });
  listen(markerMount, 'click', (event) => {
    const marker = event.target.closest('[data-marker]');
    if (marker) choose(marker.dataset.marker);
  });
  listen(select, 'change', () => choose(select.value));
  for (const [selector, step] of [['[data-part-prev]', -1], ['[data-part-next]', 1]]) {
    listen(find(selector), 'click', () => {
      const i = hardwareParts.findIndex(({ id }) => id === selected);
      choose(hardwareParts[(i + step + hardwareParts.length) % hardwareParts.length].id);
    });
  }
  listen(isolateButton, 'click', () => {
    if (Math.min(...separations()) < .99) seek(.5);
    setIsolated(!isolated);
    updateInterface();
    load();
  });
  section.querySelectorAll('[data-hardware-view]').forEach((button) => {
    listen(button, 'click', () => {
      setIsolated(false);
      seek(button.dataset.hardwareView === 'exploded' ? .5 : .99);
      load();
    });
  });
  listen(scrub, 'input', () => { setIsolated(false); seek(Number(scrub.value) / 1000); load(); });
  listen(reducedMotion, 'change', configureTimeline);
  listen(compact, 'change', configureTimeline);
  listen(window, 'mori:theme-change', (event) => {
    theme = event.detail.theme;
    model?.setTheme(theme);
    schedule();
  });
  listen(document, 'visibilitychange', schedule);
  const shellObserver = new MutationObserver(() => {
    if (shell === document.body.dataset.shell) return;
    shell = document.body.dataset.shell;
    model?.setShell(shell);
    fallback.setShell(shell);
    schedule();
  });
  shellObserver.observe(document.body, { attributes: true, attributeFilter: ['data-shell'] });
  const resizeObserver = new ResizeObserver(() => { resize = true; schedule(); });
  resizeObserver.observe(viewport);
  // The live console above the studio can grow (notices, textarea resizing).
  // Keep absolute scroll landmarks current without interrupting native anchors.
  const consoleObserver = new ResizeObserver(() => { if (trigger) ScrollTrigger.refresh(true); });
  const consoleSection = document.querySelector('#talk');
  if (consoleSection) consoleObserver.observe(consoleSection);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule();
  });
  visibilityObserver.observe(stage);
  const loadObserver = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) { loadObserver.disconnect(); load(); }
  }, { rootMargin: '550px 0px' });
  loadObserver.observe(section);
  updateMode();
  updateDetail();
  configureTimeline();
  fallback.setShell(shell);

  function dispose() {
    if (destroyed) return;
    destroyed = true;
    abort.abort();
    if (frame !== null) cancelAnimationFrame(frame);
    loadObserver.disconnect(); visibilityObserver.disconnect(); resizeObserver.disconnect(); shellObserver.disconnect(); consoleObserver.disconnect();
    trigger?.kill(); timeline?.kill(); model?.dispose();
  }
  listen(window, 'pagehide', (event) => { if (!event.persisted) dispose(); });
  return dispose;
}
