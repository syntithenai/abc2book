/** Three-strain reel with pickup || after each |: repeat open. */
export const ANACRUSIS_STRAIN_A = '|:FG||"D"AFDF AFDF|A2 d2 d2 cB|AFDF AFDF|"A"G2E2 E2 FG|'
  + '"D"AFDF AFDF|A2 d2 d2 de|fafd "A"egec|"D"d2f2d2:|';

export const ANACRUSIS_STRAIN_B = '|:de||fdAd fagf|"G"edcd efge| "D"fdAd fgaf|"A"edcB A2 de|'
  + '"D"fdAd fagf|"G"edcd efge|"D"fafd "A"egec|"D"d2f2 d2:|';

export const ANACRUSIS_STRAIN_C = '|:de||"D"fefg abaf|"G"edef gfeg| "D"fefg abaf|"A"edcB A2 de|'
  + '"D"fefg abaf|"G"edef gfeg|"D"fedf "A"edce|"D"d2dd d2:|';

export const ANACRUSIS_THREE_STRAINS = [
  ANACRUSIS_STRAIN_A,
  ANACRUSIS_STRAIN_B,
  ANACRUSIS_STRAIN_C,
].join('\n');

export const ANACRUSIS_TWO_STRAINS = [
  ANACRUSIS_STRAIN_A,
  ANACRUSIS_STRAIN_B,
].join('\n');
