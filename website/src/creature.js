// Original MORI pixel silhouette and palette, with authored expression layers.
// Only static, application-owned markup is used here. User text is never HTML.
export const creatureMarkup = `
  <div class="creature" role="img" aria-label="A curious little lime pixel creature">
    <span class="creature-effect" aria-hidden="true"></span>
    <div class="creature-body">
      <svg viewBox="0 0 90 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill="#d4f995" d="M24 13h9V5h9v10h15V7h9v15h9v9h7v27h-8v9H61v9H49V65H34v11H21V65H10V54H3V35h9V23h12z"/>
        <path fill="#a5ca72" d="M10 54h11v11h13v11H21V65H10zm51 4h13v9H61v9H49V65h12z"/>
        <path class="creature-eyes" fill="#213621" d="M27 32h8v13h-8zm28 0h8v13h-8z"/>
        <path class="creature-happy-eyes" fill="#213621" d="M24 36h4v-4h8v4h4v4h-4v-4h-8v4h-4zm27 0h4v-4h8v4h4v4h-4v-4h-8v4h-4z"/>
        <path class="creature-mouth" fill="#213621" d="M39 48h14v6H39z"/>
        <path fill="#ecffc7" d="M18 26h7v6h-7zm5-8h10v6H23z"/>
        <path class="creature-cheeks" fill="#accb71" d="M17 46h8v5h-8zm48 0h8v5h-8z"/>
      </svg>
    </div>
    <span class="creature-shadow" aria-hidden="true"></span>
  </div>`;

export function mountCreatures() {
  document.querySelectorAll('[data-creature]').forEach((mount) => {
    mount.innerHTML = creatureMarkup;
  });
}

const reactions = {
  feed: { effect: '✧', description: 'Mori happily munching a snack', frames: [
    { transform: 'scale(1, 1)' }, { transform: 'scale(1.18, .82)' },
    { transform: 'scale(.94, 1.08)' }, { transform: 'scale(1.12, .9)' },
    { transform: 'scale(1, 1)' },
  ] },
  pet: { effect: '♡', description: 'Mori leaning into a pat, eyes closed', frames: [
    { transform: 'rotate(0)' }, { transform: 'rotate(-12deg) translateY(-5px)' },
    { transform: 'rotate(-8deg) translateY(-5px)' }, { transform: 'rotate(0)' },
  ] },
  play: { effect: '✦', description: 'Mori bouncing with playful delight', frames: [
    { transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-34px) rotate(-18deg)' },
    { transform: 'translateY(-12px) rotate(16deg)' }, { transform: 'translateY(-20px) rotate(-8deg)' },
    { transform: 'translateY(0) rotate(0)' },
  ] },
  win: { effect: '✳', description: 'Mori celebrating your small win', frames: [
    { transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-30px) scale(1.12)' },
    { transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-14px) scale(1.06)' },
    { transform: 'translateY(0) scale(1)' },
  ] },
};

export function createReactions(reducedMotion) {
  let timeout;
  let animations = [];
  function clear() {
    clearTimeout(timeout);
    animations.forEach((animation) => animation.cancel());
    animations = [];
    document.body.removeAttribute('data-reaction');
    document.querySelectorAll('.room-pet .creature').forEach((creature) => {
      creature.setAttribute('aria-label', 'A curious little lime pixel creature');
      creature.querySelector('.creature-effect').textContent = '';
    });
  }
  reducedMotion.addEventListener('change', clear);
  return {
    clear,
    play(action) {
      clear();
      const reaction = reactions[action];
      if (!reaction) return;
      document.body.dataset.reaction = action;
      document.querySelectorAll('.room-pet .creature').forEach((creature) => {
        creature.setAttribute('aria-label', reaction.description);
        creature.querySelector('.creature-effect').textContent = reaction.effect;
        if (!reducedMotion.matches) {
          animations.push(creature.querySelector('.creature-body').animate(reaction.frames, {
            duration: action === 'pet' ? 1000 : 780,
            easing: 'ease-in-out',
          }));
        }
      });
      timeout = setTimeout(clear, 1800);
    },
  };
}
