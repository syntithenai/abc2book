// Notation editor E2E fixtures — keep in sync with e2e/notation-fixtures.js

export const NOTATION_E2E_TUNE_ID = 'e2e00000000000000000001'
export const NOTATION_E2E_TWO_VOICE_ID = 'e2e00000000000000000002'
export const NOTATION_E2E_MULTILINE_ID = 'e2e00000000000000000003'
export const NOTATION_E2E_EMPTY_ID = 'e2e00000000000000000004'
export const NOTATION_E2E_RICH_ID = 'e2e00000000000000000005'

export const NOTATION_E2E_TUNE_IDS = {
  basic: NOTATION_E2E_TUNE_ID,
  twoVoice: NOTATION_E2E_TWO_VOICE_ID,
  multiline: NOTATION_E2E_MULTILINE_ID,
  empty: NOTATION_E2E_EMPTY_ID,
  rich: NOTATION_E2E_RICH_ID,
}

export const NOTATION_E2E_FULL_ABC = `X:10
% abcbook-tune_id ${NOTATION_E2E_TUNE_ID}
T:Notation E2E Basic
M:4/4
L:1/4
K:C
B:e2e-notation
C D E F |

X:11
% abcbook-tune_id ${NOTATION_E2E_TWO_VOICE_ID}
T:Notation E2E Two Voice
M:4/4
L:1/4
K:C
B:e2e-notation
V:1
C E G |
V:2
G, B, D |

X:12
% abcbook-tune_id ${NOTATION_E2E_MULTILINE_ID}
T:Notation E2E Multiline
M:4/4
L:1/4
K:C
B:e2e-notation
C D E F | G A B c |
d e f g |

X:13
% abcbook-tune_id ${NOTATION_E2E_EMPTY_ID}
T:Notation E2E Empty
M:4/4
L:1/4
K:C
B:e2e-notation

X:14
% abcbook-tune_id ${NOTATION_E2E_RICH_ID}
T:Notation E2E Rich
M:6/8
L:1/8
K:G
B:e2e-notation
G A B | c3 |

`
