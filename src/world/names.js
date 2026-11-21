import { RNG } from '../core/rng.js';

const ON = ['gl', 'bl', 'sn', 'fr', 'w', 'z', 'pl', 'qu', 'gr', 'fl', 'm', 'sk', 'dr', 'v', 'th', 'squ', 'br', 'n'];
const NU = ['oo', 'u', 'i', 'o', 'ee', 'a', 'ou', 'y', 'au', 'oi'];
const CO = ['rp', 'mble', 'b', 'nk', 'zz', 'ffle', 'p', 'sh', 'ggle', 'm', 'rt', 'x', 'ndle', 'ck', 'lp'];

export function syllables(rng, n = 2) {
  let s = '';
  for (let i = 0; i < n; i++) s += rng.pick(ON) + rng.pick(NU) + (i === n - 1 || rng.chance(0.5) ? rng.pick(CO) : '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function worldName(rng) {
  const forms = [
    () => `${syllables(rng, 2)}land`,
    () => `Pocket ${syllables(rng, 2)}`,
    () => `${syllables(rng, 1)}-${syllables(rng, 1)} Hollow`,
    () => `The ${syllables(rng, 2)} Enclosure`,
  ];
  return `${rng.pick(forms)()} #${rng.int(100, 999)}`;
}

const EPITHET = ['Lesser', 'Greater', 'Weeping', 'Sideways', 'Smiling', 'Hollow', 'Velvet', 'Humming', 'Spotted', 'Patient', 'Nervous', 'Royal', 'Forgetful', 'Lunar', 'Damp', 'Polite'];
const SUFFIX = { blob: ['blob', 'ling', 'pudd', 'gloop'], strider: ['strider', 'stilt', 'longleg', 'wader'], floater: ['jelly', 'drift', 'moth', 'bloom'], worm: ['worm', 'noodle', 'grub', 'coil'], quad: ['hound', 'trot', 'pup', 'moose'] };

export function speciesName(rng, archetype) {
  return `${rng.pick(EPITHET)} ${syllables(rng, 1)}${rng.pick(SUFFIX[archetype] || ['thing'])}`;
}

export const LANDMARK_TITLES = {
  watchers: ['The Smiling Choir', 'Circle of Patient Faces', 'The Onlookers', 'Ring of Agreeable Heads'],
  monolith: ['The Humming Slab', 'Unlabelled Monolith', 'The Black Receipt', 'Obelisk of Static'],
  portal: ['Fold Gate', 'The Doorway Without Walls', 'Shortcut Arch', 'Stitch Portal'],
  floaters: ['The Hovering Isles', 'Stones That Forgot to Fall', 'Drift Archipelago'],
  giantshroom: ['Grandmother Cap', 'The Springhouse', 'Bouncing Elder'],
  eyepond: ['The Blinking Pool', 'Pond of Regard', 'The Wet Eye'],
  fountain: ['Rainbow Wellspring', 'The Colour Tap', 'Prism Fountain'],
  ribcage: ['The Old Ribs', 'Skeleton of Something Big', 'Ivory Cathedral'],
  egg: ['The Unhatched', 'A Very Large Egg', 'The Waiting Egg'],
  terminal: ['Builder Terminal', 'Maintenance Console', 'Caretaker Screen'],
  upsidetree: ['The Hanging Tree', 'Wrongway Oak', 'Tree That Fell Up'],
  spiral: ['The Corkscrew Spire', 'Twisting Needle', 'Helix of Nobody'],
};

const LORE = {
  watchers: ['They turn to face whoever walks the ring. Nobody has seen them move.', 'Each face is slightly happier than the last. The last one is unbearable.', 'Carved, or grown? The stone is warm.'],
  monolith: ['It hums in the key of the world. Touch it and the map remembers more.', 'Scratched into its base: "DO NOT RECOMPILE WHILE OCCUPIED".', 'It reflects a sky that is not this one.'],
  portal: ['Step through and the world folds. Every gate knows exactly one other.', 'The air inside smells like the inside of a cupboard.'],
  floaters: ['The gravity here gave up. A springy patch below helps visitors join them.', 'Rocks bob gently, like they are breathing.'],
  giantshroom: ['Its cap is springy enough to throw you into the clouds.', 'Residents gather beneath it when it rains.'],
  eyepond: ['The eye follows you. It blinks when you are not looking.', 'Drop nothing in. It remembers.'],
  fountain: ['The rainbow rivers start here, or end here. Water is unsure.', 'Every colour comes out. Some go back in.'],
  ribcage: ['Whatever this was, it was the size of a hill and very well fed.', 'The wind plays the ribs like an instrument.'],
  egg: ['It is warm. It is waiting. Perhaps it needs a visitor.', 'Something inside is tapping politely.'],
  terminal: ['A screen running diagnostics on the pocket world. It lists the rules.', 'The keyboard has one key. It says "OK".'],
  upsidetree: ['Roots in the sky, leaves near the ground. It has strong opinions.', 'Fruit falls upward here, mostly.'],
  spiral: ['A tower twisted like a wrung towel. The top hums.', 'Count the turns. The number changes.'],
};

export function landmarkText(rng, type) {
  return { name: rng.pick(LANDMARK_TITLES[type]), lore: rng.pick(LORE[type]) };
}

const MEMORY_TEMPLATES = [
  'Builder\'s log {n}: Seeded the hills with {thing}. The residents have started naming them.',
  'Builder\'s log {n}: The {creature} keep staring at the sky seam. I told them it is just weather.',
  'Note to self: the rainbow river was supposed to be blue. It refused.',
  'Builder\'s log {n}: Gravity patch {n2} applied. Some rocks did not get the memo.',
  'Containment report: pocket stable. Edge shimmer within tolerance. Residents unaware. Mostly.',
  'If you are reading this, you are not a resident. Please wipe your feet.',
  'Builder\'s log {n}: Added night. The {creature} were very upset for {n2} days.',
  'The edge of the world is a polite suggestion rendered as a wall.',
  'Builder\'s log {n}: Something in the {biome} is breathing. Not in the spec.',
  'Memory fragment: a voice laughing, then a door closing, then the hum.',
  'Rule zero: everything here is play. Rule zero-point-five: play gets weird when unsupervised.',
  'Builder\'s log {n}: Planted the first {thing}. Grew a face overnight. Kept it.',
  'Maintenance: the sun is a lamp on a track. Please do not look at the track.',
  'Builder\'s log {n}: I hid motes of memory all over. Whoever finds them all gets the truth.',
  'Final entry: I am leaving the pocket running. Somebody should enjoy it.',
];
const THINGS = ['lollipop trees', 'humming crystals', 'blinking ponds', 'cotton hills', 'tooth stones', 'mushrooms'];

export function memoryFragments(seedInt, creatureNames, biomeNames) {
  const rng = new RNG(seedInt ^ 0x51ed);
  return MEMORY_TEMPLATES.map((t, i) =>
    t.replace(/\{n\}/g, String(rng.int(2, 999)))
      .replace(/\{n2\}/g, String(rng.int(2, 40)))
      .replace(/\{thing\}/g, rng.pick(THINGS))
      .replace(/\{creature\}/g, rng.pick(creatureNames) || 'residents')
      .replace(/\{biome\}/g, rng.pick(biomeNames) || 'hills')
      + (i === MEMORY_TEMPLATES.length - 1 ? '' : ''));
}
