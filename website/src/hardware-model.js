import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hardwareParts } from './hardware-parts.js';

// This is an authored, procedural design illustration, not CAD. Dimensions are
// composition units, not millimetres; the proposed parts are deliberately readable.
const CLOSED = {
  enclosure: [0, 0, .43], bumper: [0, 0, -.13], lens: [0, .34, .49],
  display: [0, .34, .31], buttons: [0, -1.17, .40], pcb: [0, 0, -.10],
  compute: [-.34, .83, .03], motion: [.83, .28, .02], microphone: [-.92, 1.10, .04],
  mute: [1.36, .80, -.08], speaker: [.35, -.99, -.35], haptic: [-.67, -1.13, -.31],
  battery: [0, -.03, -.40], power: [0, -1.60, -.12], rear: [0, 0, -.65],
  fasteners: [0, 0, -.25],
};
const OPEN = {
  enclosure: [-3.10, .72, 2.40], bumper: [-2.02, .48, 1.45], lens: [-1.02, .70, 1.18],
  display: [-.16, .32, .90], buttons: [-2.24, -2.18, 1.70], pcb: [1.12, -.10, -.45],
  compute: [.76, 2.32, .54], motion: [1.95, 2.23, .35], microphone: [2.96, 2.04, .22],
  mute: [3.82, 1.60, .15], speaker: [.60, -2.22, .32], haptic: [1.96, -2.22, .04],
  battery: [2.64, -.30, -1.66], power: [3.25, -2.10, -.20], rear: [3.95, -.50, -2.80],
  fasteners: [4.15, 1.35, -1.50],
};
const TILTS = {
  enclosure: [.04, -.13, .04], bumper: [0, -.06, .04], lens: [.02, -.06, .02],
  display: [0, -.03, .01], buttons: [.12, -.08, .03], pcb: [0, .05, -.02],
  compute: [.08, -.1, -.06], motion: [.05, -.1, -.08], microphone: [.1, -.1, 0],
  mute: [.06, -.15, -.08], speaker: [.14, -.08, .03], haptic: [.14, -.1, .03],
  battery: [.02, .06, -.04], power: [.16, -.04, .04], rear: [.03, .10, -.06],
  fasteners: [.1, .04, -.05],
};

function roundedPath(width, height, radius, x = 0, y = 0, hole = false) {
  const path = hole ? new THREE.Path() : new THREE.Shape();
  const l = x - width / 2, r = x + width / 2, b = y - height / 2, t = y + height / 2;
  path.moveTo(l + radius, b);
  path.lineTo(r - radius, b);
  path.quadraticCurveTo(r, b, r, b + radius);
  path.lineTo(r, t - radius);
  path.quadraticCurveTo(r, t, r - radius, t);
  path.lineTo(l + radius, t);
  path.quadraticCurveTo(l, t, l, t - radius);
  path.lineTo(l, b + radius);
  path.quadraticCurveTo(l, b, l + radius, b);
  return path;
}

function pebble(scale = 1, hole = false) {
  const path = hole ? new THREE.Path() : new THREE.Shape();
  path.moveTo(0, 1.98 * scale);
  path.bezierCurveTo(-1.12 * scale, 1.98 * scale, -1.57 * scale, 1.27 * scale, -1.57 * scale, .26 * scale);
  path.bezierCurveTo(-1.57 * scale, -.95 * scale, -.94 * scale, -1.98 * scale, 0, -2.02 * scale);
  path.bezierCurveTo(.94 * scale, -1.98 * scale, 1.57 * scale, -.95 * scale, 1.57 * scale, .26 * scale);
  path.bezierCurveTo(1.57 * scale, 1.27 * scale, 1.12 * scale, 1.98 * scale, 0, 1.98 * scale);
  return path;
}

export function createHardwareScene(mount, { onContextLost }) {
  const canvas = document.createElement('canvas');
  // Check first: Three's constructor logs an error for an unsupported context.
  // Expected capability failures instead go straight to the illustrated view.
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
  if (!context) throw new Error('WebGL2 is not available');
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvas.setAttribute('aria-hidden', 'true');
  mount.append(canvas);

  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.rotation.set(-.035, 0, -.08);
  scene.add(root);
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100);
  const viewDirection = new THREE.Vector3(5.0, 3.3, 11).normalize();
  camera.position.copy(viewDirection).multiplyScalar(20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const geometryCache = new Map();
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const ownGeometry = (geometry) => { geometries.add(geometry); return geometry; };
  const ownMaterial = (material) => { materials.add(material); return material; };
  const ownTexture = (texture) => { textures.add(texture); return texture; };
  const standard = (color, options = {}) => ownMaterial(new THREE.MeshStandardMaterial({
    color, roughness: .5, metalness: .08, ...options,
  }));
  const palette = {
    shell: ownMaterial(new THREE.MeshPhysicalMaterial({ color: '#a9b991', roughness: .36, metalness: .03, clearcoat: .32, clearcoatRoughness: .5 })),
    rim: standard('#647454', { roughness: .72 }),
    inner: standard('#7f9070', { roughness: .65 }),
    button: standard('#3c5131', { roughness: .58 }),
    dark: standard('#16231d', { roughness: .56 }),
    black: standard('#121b19', { roughness: .46 }),
    board: standard('#1d6650', { roughness: .6 }),
    copper: standard('#c99c54', { metalness: .74, roughness: .3 }),
    gold: standard('#d2bb79', { metalness: .82, roughness: .27 }),
    steel: standard('#c3cbd0', { metalness: .95, roughness: .27 }),
    foil: standard('#a7b1b6', { metalness: .82, roughness: .4 }),
    ceramic: standard('#c6b89c', { roughness: .78 }),
    rubber: standard('#253129', { roughness: .9 }),
    flex: standard('#c17d2e', { metalness: .36, roughness: .41, side: THREE.DoubleSide }),
    ink: standard('#dce9c4', { roughness: .9 }),
    red: standard('#b65e45', { roughness: .48 }),
    lens: ownMaterial(new THREE.MeshPhysicalMaterial({
      color: '#d8f4e5', metalness: .02, roughness: .08, transparent: true,
      opacity: .09, transmission: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
    })),
  };

  const groups = new Map();
  const partMaterials = new Map();
  for (const part of hardwareParts) {
    const group = new THREE.Group();
    group.name = part.id;
    root.add(group);
    groups.set(part.id, group);
    partMaterials.set(part.id, new Map());
  }
  function materialFor(group, material) {
    const map = partMaterials.get(group.name);
    if (!map.has(material)) map.set(material, ownMaterial(material.clone()));
    return map.get(material);
  }
  function mesh(group, geometry, material, position = [0, 0, 0], rotation) {
    const object = new THREE.Mesh(geometry, materialFor(group, material));
    object.position.set(...position);
    if (rotation) object.rotation.set(...rotation);
    group.add(object);
    return object;
  }
  function cached(key, make) {
    if (!geometryCache.has(key)) geometryCache.set(key, ownGeometry(make()));
    return geometryCache.get(key);
  }
  const box = (w, h, d, r = .025) => cached(`box:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3)));
  const cylinder = (radius, depth, segments = 32) => cached(`cyl:${radius}:${depth}:${segments}`, () => new THREE.CylinderGeometry(radius, radius, depth, segments));
  const torus = (radius, tube) => cached(`torus:${radius}:${tube}`, () => new THREE.TorusGeometry(radius, tube, 8, 48));
  const plane = (w, h) => cached(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));
  function extrude(shape, depth, bevel = .025) {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelSegments: 3, steps: 1,
      bevelSize: bevel, bevelThickness: bevel, curveSegments: 32,
    });
    geometry.translate(0, 0, -depth / 2);
    return ownGeometry(geometry);
  }
  function line(group, points, material, radius = .009) {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    return mesh(group, ownGeometry(new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), radius, 5, false)), material);
  }
  function canvasTexture(width, height, draw) {
    const surface = document.createElement('canvas');
    surface.width = width; surface.height = height;
    draw(surface.getContext('2d'));
    const texture = ownTexture(new THREE.CanvasTexture(surface));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }
  function label(group, text, w, h, position, { color = '#263b30', background = null, size = 38 } = {}) {
    const textureHeight = Math.max(64, Math.round(512 * h / w));
    const texture = canvasTexture(512, textureHeight, (ctx) => {
      if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, 512, textureHeight); }
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `500 ${size}px "Space Grotesk", sans-serif`;
      const rows = text.split('\n');
      const longest = Math.max(...rows.map((row) => ctx.measureText(row).width));
      const fontSize = size * Math.min(458 / Math.max(longest, 1), textureHeight * .72 / (rows.length * size * 1.2));
      ctx.font = `500 ${fontSize}px "Space Grotesk", sans-serif`;
      rows.forEach((row, i) => ctx.fillText(row, 256, textureHeight / 2 + (i - (rows.length - 1) / 2) * fontSize * 1.2));
    });
    return mesh(group, plane(w, h), ownMaterial(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })), position);
  }
  function chip(group, x, y, z, w, h, name, material = palette.black) {
    mesh(group, box(w, h, .11), material, [x, y, z]);
    for (let i = 0; i < 5; i++) {
      const offset = (i - 2) * h / 6;
      for (const side of [-1, 1]) mesh(group, box(.08, .035, .035, .005), palette.steel, [x + side * (w / 2 + .025), y + offset, z - .025]);
    }
    if (name) label(group, name, w * .83, h * .5, [x, y, z + .058], { color: '#cad1c1', size: 28 });
  }
  function solderPads(group, x, y, z, count, spacing, vertical = false) {
    for (let i = 0; i < count; i++) {
      mesh(group, box(vertical ? .08 : .04, vertical ? .04 : .08, .012, .004), palette.gold, [x + (vertical ? 0 : i * spacing), y + (vertical ? i * spacing : 0), z]);
    }
  }

  // 01 — A real window, button apertures, and a bevelled, seed-shaped face.
  const front = groups.get('enclosure');
  const face = pebble();
  face.holes.push(roundedPath(2.36, 1.89, .42, 0, .34, true));
  [-.65, 0, .65].forEach((x, i) => {
    const hole = new THREE.Path();
    hole.absarc(x, -1.17 - (i === 1 ? .13 : 0), .235, 0, Math.PI * 2, true);
    face.holes.push(hole);
  });
  face.holes.push(roundedPath(.42, .08, .035, 0, 1.64, true));
  mesh(front, extrude(face, .14, .055), palette.shell);
  const bezel = roundedPath(2.43, 1.96, .45, 0, .34);
  bezel.holes.push(roundedPath(2.30, 1.83, .40, 0, .34, true));
  mesh(front, extrude(bezel, .045, .015), palette.rim, [0, 0, .073]);
  label(front, 'm o r i', .58, .16, [0, 1.40, .132], { size: 52 });
  label(front, 'M – 0 1  /  A  L I T T L E  L I F E', 1.16, .12, [0, -1.70, .135], { size: 24 });

  // 02 — An independent open ring, not an opaque slab over the electronics.
  const bumper = groups.get('bumper');
  const ring = pebble(1.015);
  ring.holes.push(pebble(.93, true));
  mesh(bumper, extrude(ring, .69, .04), palette.rim);
  const seam = pebble(1.023);
  seam.holes.push(pebble(1.012, true));
  mesh(bumper, extrude(seam, .015, .003), palette.inner, [0, 0, -.16]);

  // 03 — Thin, translucent cover with a subtle edge reflection.
  const lens = groups.get('lens');
  mesh(lens, extrude(roundedPath(2.29, 1.81, .40), .035, .013), palette.lens);
  line(lens, [[-.96, .65, .042], [-.80, .78, .042], [.54, .78, .042]], palette.ink, .009);

  // 04 — A separate display, the original MORI pixels, a folded FPC, and touch IC.
  const display = groups.get('display');
  mesh(display, extrude(roundedPath(2.30, 1.82, .39), .13, .018), palette.black);
  const screenTexture = canvasTexture(512, 384, (ctx) => {
    ctx.fillStyle = '#13271e'; ctx.fillRect(0, 0, 512, 384);
    ctx.strokeStyle = '#244331'; ctx.lineWidth = 1;
    for (let x = 0; x < 512; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 384); ctx.stroke(); }
    for (let y = 0; y < 384; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    ctx.fillStyle = '#b9d69c'; ctx.font = '16px "Space Grotesk", monospace';
    ctx.fillText('♥ ♥ ♥', 45, 47); ctx.fillText('A LITTLE LIFE', 320, 47);
    ctx.save(); ctx.translate(165, 100); ctx.scale(2.05, 2.05);
    const paths = [
      ['#d4f995', 'M24 13h9V5h9v10h15V7h9v15h9v9h7v27h-8v9H61v9H49V65H34v11H21V65H10V54H3V35h9V23h12z'],
      ['#a5ca72', 'M10 54h11v11h13v11H21V65H10zm51 4h13v9H61v9H49V65h12z'],
      ['#213621', 'M27 32h8v13h-8zm28 0h8v13h-8zM39 48h14v6H39z'],
      ['#ecffc7', 'M18 26h7v6h-7zm5-8h10v6H23z'],
      ['#accb71', 'M17 46h8v5h-8zm48 0h8v5h-8z'],
    ];
    for (const [fill, path] of paths) { ctx.fillStyle = fill; ctx.fill(new Path2D(path)); }
    ctx.restore();
    ctx.fillStyle = '#c8e6a2'; ctx.textAlign = 'center'; ctx.font = '19px "Space Grotesk", monospace';
    ctx.fillText('oh, hi human.', 256, 321);
    ctx.fillStyle = '#06140a18'; for (let y = 0; y < 384; y += 4) ctx.fillRect(0, y, 512, 1);
  });
  const screenMaterial = ownMaterial(new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false }));
  // The screen plane stays inside the rounded panel's straight central area.
  mesh(display, plane(2.08, 1.53), screenMaterial, [0, 0, .085]);
  mesh(display, box(.65, .58, .025, .006), palette.flex, [.30, -1.08, -.06], [.25, 0, 0]);
  mesh(display, box(.65, .25, .025, .005), palette.flex, [.30, -1.42, -.15], [1.05, 0, 0]);
  for (let i = 0; i < 12; i++) line(display, [[.02 + i * .05, -.85, -.04], [.02 + i * .05, -1.3, -.12]], palette.gold, .005);
  solderPads(display, .04, -1.50, -.04, 11, .05);
  chip(display, -.57, -1.12, -.025, .28, .26, 'TOUCH');

  // 05 — Caps, rubber contact discs, and three separate switch mechanisms.
  const buttons = groups.get('buttons');
  [-.65, 0, .65].forEach((x, i) => {
    const y = i === 1 ? -.13 : 0;
    mesh(buttons, cylinder(.204, .14), palette.button, [x, y, .045], [Math.PI / 2, 0, 0]);
    mesh(buttons, cylinder(.17, .04), palette.rubber, [x, y, -.12], [Math.PI / 2, 0, 0]);
    mesh(buttons, box(.30, .30, .075), palette.steel, [x, y, -.22]);
    mesh(buttons, cylinder(.068, .04, 16), palette.black, [x, y, -.16], [Math.PI / 2, 0, 0]);
    label(buttons, ['✧', '♡', '↗'][i], .22, .19, [x, y, .119], { color: '#e3edce', size: 78 });
  });

  // 06 — Copper routing, vias, test pads, passives, connectors, and board silkscreen.
  const pcb = groups.get('pcb');
  const board = pebble(.83);
  [[-.96, .92], [.96, .92], [-.73, -1.14], [.73, -1.14]].forEach(([x, y]) => {
    const hole = new THREE.Path(); hole.absarc(x, y, .07, 0, Math.PI * 2, true); board.holes.push(hole);
  });
  mesh(pcb, extrude(board, .075, .008), palette.board);
  for (let i = 0; i < 12; i++) {
    const x = -.98 + i * .175;
    const direction = i % 2 === 0 ? 1 : -1;
    line(pcb, [[x, -1.1, .05], [x, -.70 + (i % 3) * .10, .05], [x + .12 * direction, -.48 + (i % 3) * .10, .05], [x + .12 * direction, .70, .05]], palette.copper, .006);
    mesh(pcb, cylinder(.026, .008, 12), palette.gold, [x, -1.12, .051], [Math.PI / 2, 0, 0]);
  }
  for (let i = 0; i < 8; i++) {
    const y = -.70 + i * .24;
    line(pcb, [[-.96, y, .05], [-.76, y, .05], [-.59, y + .13, .05], [.80, y + .13, .05]], palette.copper, .006);
  }
  for (let i = 0; i < 22; i++) {
    const x = i < 11 ? -.91 : .78;
    const y = -1 + (i % 11) * .18;
    mesh(pcb, box(.12, .055, .045, .005), i % 3 ? palette.ceramic : palette.black, [x, y, .08]);
    for (const offset of [-.06, .06]) mesh(pcb, box(.025, .064, .025, .003), palette.steel, [x + offset, y, .075]);
  }
  mesh(pcb, box(.76, .19, .10), palette.ceramic, [.12, -.67, .09]);
  solderPads(pcb, -.20, -.67, .146, 13, .05);
  chip(pcb, -.38, -.18, .09, .35, .32, 'I/O');
  label(pcb, 'MORI / M–01', .72, .16, [.24, 1.13, .048], { color: '#c3dfb5', size: 40 });
  label(pcb, 'CONCEPT PCB · REV 0', .88, .14, [0, -1.36, .049], { color: '#c3dfb5', size: 28 });
  [[-.96, .92], [.96, .92], [-.73, -1.14], [.73, -1.14]].forEach(([x, y]) => mesh(pcb, torus(.09, .014), palette.gold, [x, y, .043]));

  // 07 — RF shield, castellated contacts, and the exposed antenna meander.
  const compute = groups.get('compute');
  mesh(compute, box(.90, 1.12, .07), palette.dark);
  mesh(compute, box(.82, .78, .15, .035), palette.steel, [0, -.13, .085]);
  label(compute, 'ESP32-S3\nRADIO / COMPUTE', .70, .30, [0, -.13, .165], { size: 30 });
  line(compute, [[-.34, .37, .05], [-.34, .48, .05], [-.19, .48, .05], [-.19, .36, .05], [-.04, .36, .05], [-.04, .48, .05], [.11, .48, .05], [.11, .36, .05], [.30, .36, .05]], palette.gold, .018);
  solderPads(compute, -.45, -.46, .04, 10, .085, true);
  solderPads(compute, .45, -.46, .04, 10, .085, true);

  // 08 — Inertial sensor package on a tiny illustrative carrier.
  const motion = groups.get('motion');
  mesh(motion, box(.48, .48, .045), palette.board);
  chip(motion, 0, 0, .07, .28, .28, 'IMU');
  solderPads(motion, -.18, -.21, .033, 5, .085);
  label(motion, 'XYZ', .23, .11, [0, .175, .033], { color: '#d2e5c0', size: 38 });

  // 09 — Mic can with port and a separate acoustic gasket.
  const microphone = groups.get('microphone');
  mesh(microphone, box(.38, .47, .05), palette.board);
  mesh(microphone, box(.25, .31, .14), palette.steel, [0, 0, .08]);
  mesh(microphone, cylinder(.041, .007, 18), palette.black, [0, .052, .156], [Math.PI / 2, 0, 0]);
  mesh(microphone, torus(.064, .019), palette.rubber, [0, .052, .171]);
  solderPads(microphone, -.13, -.21, .035, 4, .085);

  // 10 — The mute is physically separate from the microphone.
  const mute = groups.get('mute');
  mesh(mute, box(.27, .53, .20), palette.steel);
  mesh(mute, box(.19, .24, .28), palette.rim, [.03, .11, .12]);
  mesh(mute, box(.04, .09, .015, .004), palette.red, [.04, -.15, .108]);
  [-.13, 0, .13].forEach((y) => mesh(mute, box(.13, .045, .04, .006), palette.gold, [-.19, y, -.05]));

  // 11 — A driver with concentric suspension, dust cap, grille, and amplifier.
  const speaker = groups.get('speaker');
  mesh(speaker, cylinder(.43, .17, 48), palette.steel, [0, 0, 0], [Math.PI / 2, 0, 0]);
  mesh(speaker, cylinder(.38, .08, 48), palette.black, [0, 0, .10], [Math.PI / 2, 0, 0]);
  [.30, .34, .38].forEach((r) => mesh(speaker, torus(r, .018), palette.rubber, [0, 0, .155]));
  mesh(speaker, ownGeometry(new THREE.SphereGeometry(.21, 32, 16)), palette.dark, [0, 0, .11]).scale.z = .38;
  const grille = mesh(speaker, cylinder(.41, .012, 48), palette.dark, [0, 0, -.105], [Math.PI / 2, 0, 0]);
  grille.material = materialFor(speaker, palette.dark);
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) {
    if (x * x + y * y < 11) mesh(speaker, cylinder(.021, .006, 8), palette.steel, [x * .09, y * .09, -.115], [Math.PI / 2, 0, 0]);
  }
  mesh(speaker, box(.41, .30, .045), palette.board, [.67, 0, 0]);
  chip(speaker, .67, 0, .06, .23, .20, 'AMP');
  line(speaker, [[.27, -.25, -.01], [.5, -.36, .01], [.67, -.18, .01]], palette.red, .018);
  line(speaker, [[.30, -.20, -.02], [.55, -.28, .02], [.72, -.15, .02]], palette.black, .018);

  // 12 — Coin-style LRA can and its own control IC.
  const haptic = groups.get('haptic');
  mesh(haptic, cylinder(.27, .16, 40), palette.steel, [0, 0, 0], [Math.PI / 2, 0, 0]);
  mesh(haptic, cylinder(.22, .008, 40), palette.foil, [0, 0, .087], [Math.PI / 2, 0, 0]);
  label(haptic, 'LRA', .30, .16, [0, 0, .096], { size: 42 });
  mesh(haptic, box(.29, .24, .04), palette.board, [.47, 0, 0]);
  chip(haptic, .47, 0, .055, .18, .15, '');
  line(haptic, [[.10, -.18, 0], [.34, -.25, 0], [.48, -.13, .03]], palette.copper, .017);

  // 13 — Metallic pouch, folded seams, protection PCB, leads, and an honest label.
  const battery = groups.get('battery');
  mesh(battery, box(1.81, 2.29, .24, .065), palette.foil);
  for (const x of [-.94, .94]) mesh(battery, box(.10, 2.34, .06, .015), palette.steel, [x, 0, -.01]);
  mesh(battery, box(1.83, .12, .07, .015), palette.steel, [0, -1.18, -.01]);
  mesh(battery, box(1.74, .24, .08), palette.board, [0, 1.20, -.025]);
  chip(battery, -.35, 1.20, .06, .28, .14, '');
  mesh(battery, box(1.45, 1.45, .006, .001), palette.ink, [0, -.02, .124]);
  label(battery, 'MORI / ENERGY\nPROTECTED Li-ion', 1.30, .40, [0, .35, .131], { size: 30 });
  label(battery, 'SINGLE CELL · DESIGN STUDY\nCAPACITY / RUNTIME TBD', 1.28, .30, [0, -.25, .131], { size: 26 });
  label(battery, '+                 −', 1.25, .18, [0, -.55, .132], { size: 44 });
  line(battery, [[.54, 1.28, 0], [.80, 1.43, 0], [1.07, 1.20, .04]], palette.red, .025);
  line(battery, [[.68, 1.28, 0], [.89, 1.36, 0], [1.14, 1.20, .04]], palette.black, .025);
  mesh(battery, box(.25, .14, .12), palette.ceramic, [1.10, 1.15, .035]);

  // 14 — USB-C opening, tongue/pins, and individually modelled power silicon.
  const power = groups.get('power');
  mesh(power, box(1.22, .48, .045), palette.board, [0, .06, 0]);
  const socket = roundedPath(.47, .20, .075);
  socket.holes.push(roundedPath(.38, .12, .04, 0, 0, true));
  mesh(power, extrude(socket, .22, .012), palette.steel, [0, -.18, .06], [.75, 0, 0]);
  mesh(power, box(.31, .025, .20, .008), palette.dark, [0, -.19, .06], [.75, 0, 0]);
  solderPads(power, -.12, -.21, .17, 8, .035);
  chip(power, -.40, .10, .07, .22, .22, 'CHG');
  chip(power, .0, .14, .07, .23, .21, '3V3');
  chip(power, .42, .10, .07, .18, .20, 'SOC');
  mesh(power, box(.18, .18, .12), palette.dark, [.27, -.09, .07]);
  label(power, 'USB-C / POWER PATH', 1.05, .12, [0, .35, .03], { color: '#c5ddb9', size: 25 });

  // 15 — A shallow rear bowl, internal ribs, speaker vents, and a woven loop.
  const rear = groups.get('rear');
  mesh(rear, extrude(pebble(.97), .10, .07), palette.shell, [0, 0, -.07]);
  const rearLip = pebble(.975);
  rearLip.holes.push(pebble(.89, true));
  mesh(rear, extrude(rearLip, .20, .025), palette.inner, [0, 0, .045]);
  for (const x of [-.94, .94]) mesh(rear, box(.055, 1.73, .13), palette.inner, [x, -.05, .07]);
  for (let x = -3; x <= 3; x++) for (let y = -2; y <= 2; y++) {
    if (x * x + y * y < 12) mesh(rear, cylinder(.027, .012, 10), palette.dark, [.48 + x * .10, -.99 + y * .10, .053], [Math.PI / 2, 0, 0]);
  }
  label(rear, 'MORI\nA LITTLE LIFE OF ITS OWN', 1.16, .42, [0, .58, .058], { size: 24 });
  mesh(rear, torus(.26, .065), palette.rim, [0, 2.05, -.05]);
  const cord = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.15, 2.23, -.06), new THREE.Vector3(-.23, 2.58, -.10),
    new THREE.Vector3(.07, 2.74, -.15), new THREE.Vector3(.25, 2.49, -.12), new THREE.Vector3(.13, 2.23, -.06),
  ]);
  mesh(rear, ownGeometry(new THREE.TubeGeometry(cord, 40, .045, 8, false)), palette.rubber);
  for (let i = 0; i < 22; i++) {
    const point = cord.getPoint(i / 21);
    mesh(rear, ownGeometry(new THREE.SphereGeometry(.048, 6, 4)), palette.inner, point.toArray()).scale.set(.8, .22, 1);
  }

  // 16 — Separate screws, slotted heads, brass inserts, and locating posts.
  const fasteners = groups.get('fasteners');
  [[-1.02, .99], [1.02, .99], [-.81, -1.19], [.81, -1.19]].forEach(([x, y]) => {
    mesh(fasteners, cylinder(.062, .37, 20), palette.steel, [x, y, 0], [Math.PI / 2, 0, 0]);
    mesh(fasteners, cylinder(.115, .07, 24), palette.steel, [x, y, .20], [Math.PI / 2, 0, 0]);
    mesh(fasteners, box(.14, .024, .006, .002), palette.black, [x, y, .239]);
    mesh(fasteners, box(.024, .14, .006, .002), palette.black, [x, y, .24]);
    mesh(fasteners, cylinder(.115, .14, 24), palette.gold, [x, y, -.21], [Math.PI / 2, 0, 0]);
    mesh(fasteners, torus(.070, .012), palette.dark, [x, y, -.129]);
    for (let i = 0; i < 5; i++) mesh(fasteners, torus(.063, .009), palette.foil, [x, y, -.12 + i * .055]);
  });

  // Batch static details ONLY within a selectable subsystem. Caps, traces,
  // contacts, and screws retain their own physical geometry, but don't each
  // require a GPU draw call. Never merge the display/PCB/battery into a shell.
  for (const group of groups.values()) {
    const batches = new Map();
    for (const child of group.children) {
      if (!batches.has(child.material)) batches.set(child.material, []);
      batches.get(child.material).push(child);
    }
    for (const [material, children] of batches) {
      if (children.length < 2) continue;
      const pieces = children.map((child) => {
        child.updateMatrix();
        const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        return geometry.applyMatrix4(child.matrix);
      });
      const merged = mergeGeometries(pieces);
      pieces.forEach((geometry) => geometry.dispose());
      if (merged) {
        children.forEach((child) => group.remove(child));
        group.add(new THREE.Mesh(ownGeometry(merged), material));
      }
    }
  }
  const usedGeometry = new Set();
  root.traverse((object) => { if (object.geometry) usedGeometry.add(object.geometry); });
  for (const geometry of geometries) {
    if (!usedGeometry.has(geometry)) { geometry.dispose(); geometries.delete(geometry); }
  }
  geometryCache.clear();

  // Local, procedural studio reflections; no HDRI/image/network dependency.
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environment, .05);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = .78;
  environment.dispose();
  pmrem.dispose();
  const ambient = new THREE.HemisphereLight('#edf5e5', '#5c7157', 2.1);
  const key = new THREE.DirectionalLight('#fff4df', 3.5);
  key.position.set(-4, 7, 8);
  const edge = new THREE.DirectionalLight('#d1e2ec', 2.6);
  edge.position.set(6, 1, -4);
  scene.add(ambient, key, edge);

  const shadowTexture = canvasTexture(128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 3, 64, 64, 64);
    gradient.addColorStop(0, '#0007'); gradient.addColorStop(.35, '#0004'); gradient.addColorStop(1, '#0000');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  });
  const shadowMaterial = ownMaterial(new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: .5 }));
  const shadow = new THREE.Mesh(plane(7, 4), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -2.30;
  scene.add(shadow);

  let selected = 'enclosure', isolated = false, spread = 0, disposed = false, renderCount = 0;
  let width = 1, height = 1;
  const point = new THREE.Vector3();
  const worldBox = new THREE.Box3();
  function applyPose(values) {
    spread = Math.max(...hardwareParts.map(({ id }) => values[id]));
    for (const [id, group] of groups) {
      const t = values[id] || 0;
      group.position.set(...CLOSED[id]).lerp(point.set(...OPEN[id]), t);
      group.rotation.set(...TILTS[id].map((angle) => angle * t));
      group.visible = !isolated || id === selected;
    }
    root.updateMatrixWorld(true);
  }
  // Project each part's bounding corners, rather than a giant world-axis box.
  function framing(onlyPart) {
    const min = new THREE.Vector2(Infinity, Infinity), max = new THREE.Vector2(-Infinity, -Infinity);
    for (const [id, group] of groups) {
      if (onlyPart && id !== onlyPart) continue;
      worldBox.setFromObject(group);
      for (const x of [worldBox.min.x, worldBox.max.x]) for (const y of [worldBox.min.y, worldBox.max.y]) for (const z of [worldBox.min.z, worldBox.max.z]) {
        point.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        min.x = Math.min(min.x, point.x); min.y = Math.min(min.y, point.y);
        max.x = Math.max(max.x, point.x); max.y = Math.max(max.y, point.y);
      }
    }
    const center = new THREE.Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, 0).applyQuaternion(camera.quaternion);
    return { center, width: max.x - min.x, height: max.y - min.y };
  }
  const zeros = Object.fromEntries(hardwareParts.map(({ id }) => [id, 0]));
  const ones = Object.fromEntries(hardwareParts.map(({ id }) => [id, 1]));
  applyPose(zeros); const closedFrame = framing();
  applyPose(ones); const openFrame = framing();
  applyPose(zeros);
  let values = zeros;
  function highlight() {
    for (const [id, map] of partMaterials) {
      for (const [source, material] of map) {
        if (source === palette.lens) material.opacity = id === selected && spread > .5 ? .26 : source.opacity;
        if (!material.emissive) continue;
        material.emissive.copy(source.emissive);
        material.emissiveIntensity = source.emissiveIntensity;
        if (id === selected && spread > .5 && !isolated) {
          material.emissive.set('#bbd989'); material.emissiveIntensity = .065;
        }
      }
    }
  }
  function updateCamera() {
    // Camera basis stays fixed, so both ends are bit-for-bit the same closed pose.
    camera.position.copy(viewDirection).multiplyScalar(20);
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const frame = isolated ? framing(selected) : {
      center: closedFrame.center.clone().lerp(openFrame.center, spread),
      width: THREE.MathUtils.lerp(closedFrame.width, openFrame.width, spread),
      height: THREE.MathUtils.lerp(closedFrame.height, openFrame.height, spread),
    };
    const aspect = width / height;
    const padding = isolated ? 1.32 : 1.16;
    const size = Math.max(frame.height * padding, frame.width * padding / aspect, isolated ? .65 : 0);
    camera.left = -size * aspect / 2; camera.right = size * aspect / 2;
    camera.top = size / 2; camera.bottom = -size / 2;
    camera.position.copy(frame.center).addScaledVector(viewDirection, 20);
    camera.lookAt(frame.center);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    shadow.visible = !isolated;
    shadow.scale.set(1 + spread * 1.3, 1, 1);
  }
  function setShell(shell) {
    const colors = {
      sage: ['#a9b991', '#647454', '#7f9070'],
      cream: ['#e2d5b8', '#ac997b', '#c3b596'],
      lavender: ['#c5b9da', '#8c7e9f', '#a79bb7'],
    }[shell] || ['#a9b991', '#647454', '#7f9070'];
    [palette.shell, palette.rim, palette.inner].forEach((source, i) => {
      source.color.set(colors[i]);
      for (const map of partMaterials.values()) map.get(source)?.color.copy(source.color);
    });
    canvas.dataset.shell = shell;
  }
  function setTheme(theme) {
    const light = theme === 'light';
    scene.environmentIntensity = light ? .70 : .74;
    ambient.intensity = light ? .85 : .75;
    key.intensity = light ? 2.20 : 2.45;
    edge.intensity = light ? 1.45 : 2.0;
    renderer.toneMappingExposure = light ? .98 : 1.04;
    shadowMaterial.opacity = light ? .36 : .66;
    canvas.dataset.theme = light ? 'light' : 'dark';
  }
  function lost(event) {
    event.preventDefault();
    if (!disposed) onContextLost();
  }
  canvas.addEventListener('webglcontextlost', lost);
  setShell(document.body.dataset.shell);
  setTheme(document.documentElement.dataset.theme);
  return {
    canvas,
    setPose(next) { values = next; applyPose(next); highlight(); },
    setSelection(id, isolate) { selected = id; isolated = isolate; applyPose(values); highlight(); },
    setShell, setTheme,
    resize() {
      const rect = mount.getBoundingClientRect();
      width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
    },
    render() {
      if (disposed || renderer.getContext().isContextLost()) return null;
      updateCamera();
      renderer.render(scene, camera);
      const positions = {};
      for (const [id, group] of groups) {
        worldBox.setFromObject(group);
        worldBox.getCenter(point).project(camera);
        positions[id] = { x: (point.x * .5 + .5) * width, y: (-point.y * .5 + .5) * height };
        let top = height;
        for (const x of [worldBox.min.x, worldBox.max.x]) for (const y of [worldBox.min.y, worldBox.max.y]) for (const z of [worldBox.min.z, worldBox.max.z]) {
          point.set(x, y, z).project(camera);
          top = Math.min(top, (-point.y * .5 + .5) * height);
        }
        positions[id].top = top;
      }
      // Diagnostics come from the real meshes and completed draw, not the UI timeline.
      canvas.dataset.renderCount = String(++renderCount);
      canvas.dataset.drawCalls = String(renderer.info.render.calls);
      canvas.dataset.triangles = String(renderer.info.render.triangles);
      canvas.dataset.pose = JSON.stringify([...groups.values()].map((group) => [
        group.name, ...group.position.toArray().map((value) => +value.toFixed(4)),
        ...group.rotation.toArray().slice(0, 3).map((value) => +value.toFixed(4)),
      ]));
      canvas.dataset.selected = selected;
      canvas.dataset.isolated = String(isolated);
      return positions;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', lost);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      environmentTarget.dispose();
      scene.clear();
      renderer.dispose();
      canvas.remove();
    },
  };
}
