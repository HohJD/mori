import { hardwareParts } from './hardware-parts.js';

// An entirely local, detailed vector study remains usable when WebGL/imports fail.
// The same 16 IDs, inspector, manual views, and highlights work in both renderers.
const outline = 'M0-102C-66-102-90-69-90-18V55Q-90 98-44 98H44Q90 98 90 55V-18C90-69 66-102 0-102Z';
const closed = {
  enclosure: [460, 295], bumper: [463, 303], lens: [460, 278], display: [462, 282],
  buttons: [460, 351], pcb: [466, 301], compute: [449, 257], motion: [500, 290],
  microphone: [420, 250], mute: [537, 271], speaker: [490, 363], haptic: [430, 361],
  battery: [473, 309], power: [467, 389], rear: [480, 320], fasteners: [467, 302],
};
const opened = {
  enclosure: [140, 230], bumper: [237, 252], lens: [321, 228], display: [405, 256],
  buttons: [211, 434], pcb: [506, 306], compute: [451, 109], motion: [566, 115],
  microphone: [650, 143], mute: [730, 170], speaker: [446, 478], haptic: [572, 500],
  battery: [642, 350], power: [708, 521], rear: [788, 397], fasteners: [815, 198],
};
const pads = Array.from({ length: 10 }, (_, i) => `<path d="M${-23 + i * 5} 23v7" stroke="#d8ba77" stroke-width="3"/>`).join('');
const chip = (name, w = 44, h = 35) => `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="3" fill="#1c2924" stroke="#aab59f" stroke-width="2"/><text text-anchor="middle" y="4" font-size="7" fill="#e1e5d3">${name}</text>`;
const traces = Array.from({ length: 9 }, (_, i) => `<path d="M${-58 + i * 14} 68V${18 - i * 5}l12-12V-65" fill="none" stroke="#bf9e5e" stroke-width="1.5"/><circle cx="${-58 + i * 14}" cy="73" r="3" fill="#d3bb7b"/>`).join('');
const vents = Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => `<circle cx="${col * 7 - 14}" cy="${row * 7 - 14}" r="2" fill="#14241b"/>`).join('')).join('');
const face = `<path d="M24 13h9V5h9v10h15V7h9v15h9v9h7v27h-8v9H61v9H49V65H34v11H21V65H10V54H3V35h9V23h12z" fill="#d4f995"/><path d="M27 32h8v13h-8zm28 0h8v13h-8zM39 48h14v6H39z" fill="#213621"/>`;
const artwork = {
  enclosure: `<path d="${outline} M-51-53H51Q62-53 62-41V18Q62 32 49 32H-49Q-62 32-62 18V-41Q-62-53-51-53Z M-46 63a12 12 0 1 0 24 0a12 12 0 1 0-24 0 M-12 70a12 12 0 1 0 24 0a12 12 0 1 0-24 0 M22 63a12 12 0 1 0 24 0a12 12 0 1 0-24 0" fill="url(#shell)" fill-rule="evenodd" stroke="#d6dfc2" stroke-width="2"/><text y="-70" text-anchor="middle" letter-spacing="4" font-size="10" fill="#384a34">mori</text><text y="96" text-anchor="middle" font-size="5" fill="#384a34">M–01 / A LITTLE LIFE</text>`,
  bumper: `<path d="${outline}" fill="none" stroke="#58694e" stroke-width="12"/><path d="${outline}" transform="translate(3 5)" fill="none" stroke="#9eaf8b" stroke-width="3"/>`,
  lens: '<rect x="-61" y="-45" width="122" height="90" rx="24" fill="#cbe5d529" stroke="#bdd6c3" stroke-width="2"/><path d="M-48-26Q-48-35-32-35H34" fill="none" stroke="#e3f3df" stroke-width="2"/>',
  display: `<rect x="-62" y="-46" width="124" height="94" rx="20" fill="#14251d" stroke="#718575" stroke-width="4"/><g transform="translate(-28 -28) scale(.65)">${face}</g><text y="37" text-anchor="middle" fill="#bada9e" font-size="7">one little thing.</text><path d="M12 49v42h34V57" fill="#ad792e" stroke="#dfb86d" stroke-width="2"/><path d="M18 49v37m7-37v37m7-37v37m7-37v37" stroke="#f0cb7c"/>`,
  buttons: [-34, 0, 34].map((x, i) => `<g transform="translate(${x} ${i === 1 ? 7 : 0})"><rect x="-12" y="-10" width="24" height="24" rx="3" fill="#c5ccc1"/><circle r="11" fill="#576d43" stroke="#bccb99"/><text text-anchor="middle" y="4" fill="#e0edc6" font-size="${i === 1 ? 6 : 14}">${['■', 'TALK', '⇄'][i]}</text></g>`).join(''),
  pcb: `<path d="${outline}" transform="scale(.88)" fill="#205a45" stroke="#79a381" stroke-width="2"/>${traces}<g transform="translate(-22 -10)">${chip('I/O', 30, 27)}</g><text y="-70" text-anchor="middle" fill="#d1e6bf" font-size="9">MORI / M–01</text><path d="M-40 49h80" stroke="#d6d7af" stroke-width="8"/>${pads}`,
  compute: `<rect x="-30" y="-37" width="60" height="74" rx="3" fill="#244d37" stroke="#adbd98"/>${pads}<rect x="-26" y="-11" width="52" height="43" rx="3" fill="url(#metal)" stroke="#dfe5de"/><text y="5" text-anchor="middle" font-size="8" fill="#34483d">ESP32-S3</text><text y="18" text-anchor="middle" font-size="5" fill="#34483d">RADIO / COMPUTE</text><path d="M-22-18v-12h9v12h9v-12h9v12h9v-12" fill="none" stroke="#d5b873" stroke-width="3"/>`,
  motion: `<rect x="-20" y="-21" width="40" height="42" rx="2" fill="#32634d"/>${chip('IMU', 25, 24)}${pads}`,
  microphone: `<rect x="-16" y="-22" width="32" height="44" rx="3" fill="#2d6548"/><rect x="-12" y="-17" width="24" height="32" rx="3" fill="url(#metal)"/><circle cy="-5" r="4" fill="#16271d"/><circle cy="-5" r="7" fill="none" stroke="#50664f" stroke-width="3"/>`,
  mute: '<rect x="-10" y="-21" width="20" height="42" rx="3" fill="url(#metal)"/><rect x="-8" y="-16" width="20" height="20" rx="3" fill="#91a378"/><rect x="-3" y="11" width="5" height="5" fill="#b35e43"/>',
  speaker: `<circle r="28" fill="url(#metal)"/><circle r="24" fill="#203029" stroke="#788777"/><circle r="20" fill="none" stroke="#091810" stroke-width="3"/><circle r="14" fill="#3a4a40" stroke="#617263"/><circle r="9" fill="#1b2c22"/><g transform="translate(50 10)">${chip('AMP', 25, 22)}</g><path d="M15 23q25 15 35 0" fill="none" stroke="#c17957" stroke-width="2"/>`,
  haptic: `<circle r="20" fill="url(#metal)" stroke="#c6d3c7"/><circle r="16" fill="none" stroke="#8b9d92"/><text y="4" text-anchor="middle" fill="#34483d" font-size="8">LRA</text><g transform="translate(38 8)">${chip('DRV', 23, 19)}</g>`,
  battery: '<rect x="-53" y="-68" width="106" height="136" rx="8" fill="url(#metal)" stroke="#c6d1c6" stroke-width="3"/><path d="M-57-62v127m114-127v127" stroke="#859c92" stroke-width="3"/><rect x="-43" y="-47" width="86" height="91" rx="2" fill="#e1e7d9"/><text text-anchor="middle" y="-27" font-size="9" fill="#34483d">MORI / ENERGY</text><text text-anchor="middle" y="-10" font-size="7" fill="#34483d">PROTECTED Li-ion</text><text text-anchor="middle" y="13" font-size="6" fill="#34483d">DESIGN STUDY</text><text text-anchor="middle" y="26" font-size="5" fill="#34483d">CAPACITY / RUNTIME TBD</text><path d="M-42-70h84" stroke="#2e644b" stroke-width="8"/><path d="M25-72q18-25 30-2" fill="none" stroke="#ba6d4e" stroke-width="3"/>',
  power: `<rect x="-43" y="-14" width="86" height="34" rx="3" fill="#2b644a"/><g transform="translate(-26 0)">${chip('CHG', 19, 15)}</g><g>${chip('3V3', 19, 15)}</g><g transform="translate(27 0)">${chip('SOC', 19, 15)}</g><rect x="-18" y="19" width="36" height="15" rx="6" fill="#1b2c22" stroke="#b4c4bd" stroke-width="4"/><path d="M-11 27h22" stroke="#b4c4bd" stroke-width="2"/>`,
  rear: `<path d="${outline}" fill="url(#shell)" stroke="#879d77" stroke-width="5"/><path d="${outline}" transform="scale(.86)" fill="#859a73" stroke="#aec49c" stroke-width="2"/><g transform="translate(22 43)">${vents}</g><path d="M-10-99c-40-75 50-75 20 0" fill="none" stroke="#66835e" stroke-width="8"/><text y="-22" text-anchor="middle" fill="#344c36" font-size="12" letter-spacing="3">MORI</text><text y="-7" text-anchor="middle" fill="#344c36" font-size="5">A LITTLE LIFE OF ITS OWN</text>`,
  fasteners: [[-25, -20], [25, -20], [-25, 24], [25, 24]].map(([x, y]) => `<g transform="translate(${x} ${y})"><path d="M0 0v24" stroke="#a8b6b0" stroke-width="5"/><path d="M-4 9h8m-8 5h8m-8 5h8" stroke="#d6ddcb"/><circle r="7" fill="url(#metal)"/><path d="M-4 0h8m-4-4v8" stroke="#2c3d30"/><circle cy="25" r="6" fill="#c7a56b"/></g>`).join(''),
};

export function createHardwareFallback(mount) {
  // Draw back-to-front at rest; all the groups genuinely separate in the study.
  const order = ['rear', 'battery', 'fasteners', 'pcb', 'compute', 'motion', 'microphone', 'mute', 'speaker', 'haptic', 'power', 'display', 'bumper', 'enclosure', 'buttons', 'lens'];
  mount.innerHTML = `<svg viewBox="0 0 920 620" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="shell" x2="1" y2="1"><stop stop-color="#d2ddbc"/><stop offset=".52" stop-color="#9eb38b"/><stop offset="1" stop-color="#718861"/></linearGradient>
      <linearGradient id="metal" x2=".9" y2=".5"><stop stop-color="#e7ece7"/><stop offset=".3" stop-color="#9aaea5"/><stop offset=".54" stop-color="#d4dfd7"/><stop offset="1" stop-color="#7f958d"/></linearGradient>
    </defs>
    ${order.map((id) => `<g data-fallback-part="${id}" font-family="Space Grotesk, sans-serif">${artwork[id]}</g>`).join('')}
  </svg>`;
  const svg = mount.querySelector('svg');
  const nodes = new Map([...mount.querySelectorAll('[data-fallback-part]')].map((node) => [node.dataset.fallbackPart, node]));
  return {
    render(values, selected, isolated) {
      const rect = mount.getBoundingClientRect();
      const result = {};
      for (const { id } of hardwareParts) {
        const t = values[id] || 0;
        const x = closed[id][0] + (opened[id][0] - closed[id][0]) * t;
        const y = closed[id][1] + (opened[id][1] - closed[id][1]) * t;
        const node = nodes.get(id);
        node.setAttribute('transform', `translate(${x} ${y}) skewY(-9)`);
        node.dataset.highlight = String(id === selected && t > .5);
        node.style.opacity = isolated && id !== selected ? '0' : '1';
        if (isolated && id === selected) {
          const box = node.getBBox();
          const size = Math.max(box.width, box.height) * 1.65;
          svg.setAttribute('viewBox', `${x - size / 2} ${y - size / 2} ${size} ${size}`);
        }
      }
      if (!isolated) svg.setAttribute('viewBox', '0 0 920 620');
      for (const [id, node] of nodes) {
        const box = node.getBoundingClientRect();
        result[id] = { x: box.left + box.width / 2 - rect.left, y: box.top + box.height / 2 - rect.top, top: box.top - rect.top };
      }
      return result;
    },
    setShell(shell) {
      const colors = { sage: ['#d2ddbc', '#9eb38b', '#718861'], cream: ['#eee4cf', '#d0bea0', '#a99776'], lavender: ['#ddd4eb', '#b4a5cc', '#8b7c9e'] }[shell];
      if (colors) mount.querySelectorAll('#shell stop').forEach((stop, i) => stop.setAttribute('stop-color', colors[i]));
    },
  };
}
