// Proposed subsystems from the hardware research, NOT a production BOM.
// IDs are shared by the model, illustrated fallback, and accessible inspector.
export const hardwareParts = [
  {
    id: 'enclosure', name: 'Front enclosure', category: 'The outer world',
    material: 'Textured polymer',
    description: 'A soft, seed-shaped home. A recessed window and three real button openings keep the face and controls within reach.',
  },
  {
    id: 'bumper', name: 'Replaceable bumper', category: 'A softer landing',
    material: 'Soft-touch silicone',
    description: 'A separate, wraparound edge cushions everyday knocks. The idea is a replaceable wear layer, not a disposable little friend.',
  },
  {
    id: 'lens', name: 'Protective lens', category: 'A window to their world',
    material: 'Coated clear polymer / glass',
    description: 'A transparent, rounded cover sits above the display. Scratch resistance, sealing, and the final optical stack still need testing.',
  },
  {
    id: 'display', name: 'IPS display & touch', category: 'A little expression',
    material: 'IPS panel · touch layer · flex',
    description: 'An ST7789-family color display is proposed for the familiar pixel face. A flexible ribbon and matching touch controller connect it to the board.',
  },
  {
    id: 'buttons', name: 'Three tactile buttons', category: 'Small, deliberate actions',
    material: 'Polymer caps · tactile switches',
    description: 'Three independent caps meet three tactile switches. The proposed controls are stop/back, talk, and switch agent: AI within reach, without a busy interface.',
  },
  {
    id: 'pcb', name: 'Main circuit board', category: 'The connected little world',
    material: 'FR-4 · copper · solder mask',
    description: 'The proposed custom PCB links graphics, sensing, sound, and power. Shown traces and test pads are illustrative, not a routable circuit design.',
  },
  {
    id: 'compute', name: 'Compute & radio', category: 'A little mind',
    material: 'ESP32-S3 module · RF shield',
    description: 'An ESP32-S3 module is the candidate for local animation and connectivity. Module variant, memory, and antenna clearance are not final.',
  },
  {
    id: 'motion', name: 'Motion sensing', category: 'A sense of the moment',
    material: 'MEMS inertial sensor',
    description: 'A BMI270-class motion sensor could recognize a pickup or tilt. Orientation, interrupts, and low-power behavior require prototype calibration.',
  },
  {
    id: 'microphone', name: 'Microphone', category: 'Only when invited',
    material: 'PDM MEMS mic · acoustic gasket',
    description: 'An IM69D128S-class near-field mic is proposed for push-to-talk. This part is a concept; the separate web console uses your browser microphone only when you choose Talk.',
  },
  {
    id: 'mute', name: 'Physical mic mute', category: 'Privacy you can feel',
    material: 'Slide switch · polymer tab',
    description: 'A dedicated hardware switch is intended to disable the microphone path. The isolation circuit and visible mute indication need validation.',
  },
  {
    id: 'speaker', name: 'Speaker & amplifier', category: 'A small voice',
    material: 'Miniature driver · class-D amp',
    description: 'A tiny diaphragm and MAX98357A-class amplifier could give Mori a voice. The acoustic cavity, seal, and safe volume are still to be designed.',
  },
  {
    id: 'haptic', name: 'Haptic feedback', category: 'A gentle hello',
    material: 'LRA actuator · haptic driver',
    description: 'A miniature linear actuator with a DRV2605L-class driver is proposed for a gentle purr. Resonance and drive strength need real-world tuning.',
  },
  {
    id: 'battery', name: 'Protected battery', category: 'A little stored energy',
    material: 'Protected single-cell Li-ion',
    description: 'A supplier-documented cell would include protection and temperature sensing. Cell size, capacity, charging limits, and runtime are not validated.',
  },
  {
    id: 'power', name: 'USB-C & power', category: 'Rest, recharge, repeat',
    material: 'USB-C · charger · regulation',
    description: 'A USB-C input, power-path charger, buck-boost rail, and fuel gauge form the proposed power system. ESD, current limits, and thermal safety need review.',
  },
  {
    id: 'rear', name: 'Rear shell & lanyard', category: 'Made to come along',
    material: 'Textured polymer · woven loop',
    description: 'A separate rear cover makes room for the battery and speaker cavity. A lanyard loop adds a familiar little carrying detail.',
  },
  {
    id: 'fasteners', name: 'Assembly & fasteners', category: 'Held, not sealed away',
    material: 'Steel screws · brass inserts',
    description: 'Four screws, threaded inserts, and internal standoffs illustrate a serviceable assembly. Tolerances, repair access, and sealing are design work ahead.',
  },
];
