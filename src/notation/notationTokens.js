/** abcjs decoration name → canonical key (identity for known types) */
export const ABCJS_DECORATION_TO_KEY = {
  upbow: 'upbow',
  downbow: 'downbow',
  fermata: 'fermata',
  accent: 'accent',
  mordent: 'mordent',
  coda: 'coda',
  pralltriller: 'pralltriller',
  segno: 'segno',
  trill: 'trill',
  staccato: 'staccato',
  wedge: 'wedge',
  uppermordent: 'uppermordent',
  turn: 'turn',
  thumb: 'thumb',
  tenuto: 'tenuto',
  snap: 'snap',
  shortphrase: 'shortphrase',
  roll: 'roll',
  pppp: 'pppp',
  ppp: 'ppp',
  pp: 'pp',
  p: 'p',
  open: 'open',
  mf: 'mf',
  mp: 'mp',
  mediumphrase: 'mediumphrase',
  lowermordent: 'lowermordent',
  longphrase: 'longphrase',
  invertedfermata: 'invertedfermata',
  fine: 'fine',
  ffff: 'ffff',
  fff: 'fff',
  ff: 'ff',
  f: 'f',
  'diminuendo)': 'diminuendoEnd',
  'diminuendo(': 'diminuendoStart',
  'crescendo)': 'crescendoEnd',
  'crescendo(': 'crescendoStart',
  breath: 'breath',
  'D.S.': 'ds',
  'D.C.': 'dc',
};

/** Canonical key → ABC token emitted before the note */
export const KEY_TO_ABC_TOKEN = {
  upbow: 'u',
  downbow: 'v',
  fermata: 'H',
  accent: 'L',
  mordent: 'M',
  coda: 'O',
  pralltriller: 'P',
  segno: 'S',
  trill: 'T',
  staccato: '.',
  wedge: '!wedge!',
  uppermordent: '!uppermordent!',
  turn: '!turn!',
  thumb: '!thumb!',
  tenuto: '!tenuto!',
  snap: '!snap!',
  shortphrase: '!shortphrase!',
  roll: '!roll!',
  pppp: '!pppp!',
  ppp: '!ppp!',
  pp: '!pp!',
  p: '!p!',
  open: '!open!',
  mf: '!mf!',
  mp: '!mp!',
  mediumphrase: '!mediumphrase!',
  lowermordent: '!lowermordent!',
  longphrase: '!longphrase!',
  invertedfermata: '!invertedfermata!',
  fine: '!fine!',
  ffff: '!ffff!',
  fff: '!fff!',
  ff: '!ff!',
  f: '!f!',
  diminuendoEnd: '!diminuendo)!',
  diminuendoStart: '!diminuendo(!',
  crescendoEnd: '!crescendo)!',
  crescendoStart: '!crescendo(!',
  breath: '!breath!',
  ds: '!D.S.!',
  dc: '!D.C.!',
};

export function decorationKeyFromAbcjs(name) {
  if (ABCJS_DECORATION_TO_KEY[name]) return ABCJS_DECORATION_TO_KEY[name];
  return null;
}

export function abcTokenForDecoration(key) {
  return KEY_TO_ABC_TOKEN[key] || ('!' + key + '!');
}

export function isKnownDecorationKey(key) {
  return Object.prototype.hasOwnProperty.call(KEY_TO_ABC_TOKEN, key);
}

/** Menu groups for Marks dropdown */
export const MARK_MENU_GROUPS = [
  {
    header: 'Phrasing',
    items: [
      { key: '_tie', label: 'Tie', shortcut: 'T' },
      { key: '_slurMode', label: 'Slur mode' },
      { key: '_clearSlur', label: 'Clear slur' },
    ],
  },
  {
    header: 'Articulations',
    items: [
      { key: 'staccato', label: 'Staccato' },
      { key: 'tenuto', label: 'Tenuto' },
      { key: 'accent', label: 'Accent' },
      { key: 'wedge', label: 'Staccatissimo' },
      { key: 'breath', label: 'Breath mark' },
    ],
  },
  {
    header: 'Ornaments',
    items: [
      { key: 'trill', label: 'Trill' },
      { key: 'mordent', label: 'Mordent' },
      { key: 'turn', label: 'Turn' },
      { key: 'pralltriller', label: 'Pralltriller' },
    ],
  },
  {
    header: 'Dynamics',
    items: [
      { key: 'p', label: 'p' },
      { key: 'mp', label: 'mp' },
      { key: 'mf', label: 'mf' },
      { key: 'f', label: 'f' },
      { key: 'ff', label: 'ff' },
      { key: 'crescendoStart', label: 'Crescendo start' },
      { key: 'crescendoEnd', label: 'Crescendo end' },
      { key: 'diminuendoStart', label: 'Diminuendo start' },
      { key: 'diminuendoEnd', label: 'Diminuendo end' },
    ],
  },
  {
    header: 'Other',
    items: [
      { key: 'fermata', label: 'Fermata' },
      { key: 'upbow', label: 'Upbow' },
      { key: 'downbow', label: 'Downbow' },
    ],
  },
];

export const TUPLET_PRESETS = [
  { label: 'Duplet', num: 2, den: 3 },
  { label: 'Triplet', num: 3, den: 2 },
  { label: 'Quadruplet', num: 4, den: 3 },
  { label: 'Quintuplet', num: 5, den: 4 },
  { label: 'Sextuplet', num: 6, den: 4 },
];
