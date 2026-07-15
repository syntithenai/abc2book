'use strict'

/** Stable tune id for notation E2E (single voice, simple C major line). */
const NOTATION_E2E_TUNE_ID = 'e2e00000000000000000001'

/** Two-voice tune for voice-switch tests. */
const NOTATION_E2E_TWO_VOICE_ID = 'e2e00000000000000000002'

/** Multi-line body for caret placement across system lines. */
const NOTATION_E2E_MULTILINE_ID = 'e2e00000000000000000003'

/** Empty voice body — build a tune from scratch in workflow tests. */
const NOTATION_E2E_EMPTY_ID = 'e2e00000000000000000004'

/** G major 6/8 tune for key-signature and meter tests. */
const NOTATION_E2E_RICH_ID = 'e2e00000000000000000005'

/** Mid-bar abcjs-n reset (Copper Kettle): A2A2^F2BE| GGFE — no trailing bar. */
const NOTATION_E2E_COPPER_ID = 'e2e00000000000000000006'

const NOTATION_E2E_BASIC_BODY = 'C D E F |'

const NOTATION_E2E_BASIC_ABC = `X:10
% abcbook-tune_id ${NOTATION_E2E_TUNE_ID}
T:Notation E2E Basic
M:4/4
L:1/4
K:C
B:e2e-notation
${NOTATION_E2E_BASIC_BODY}
`

const NOTATION_E2E_TWO_VOICE_ABC = `X:11
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
`

const NOTATION_E2E_MULTILINE_ABC = `X:12
% abcbook-tune_id ${NOTATION_E2E_MULTILINE_ID}
T:Notation E2E Multiline
M:4/4
L:1/4
K:C
B:e2e-notation
C D E F | G A B c |
d e f g |
`

const NOTATION_E2E_EMPTY_ABC = `X:13
% abcbook-tune_id ${NOTATION_E2E_EMPTY_ID}
T:Notation E2E Empty
M:4/4
L:1/4
K:C
B:e2e-notation

`

const NOTATION_E2E_RICH_ABC = `X:14
% abcbook-tune_id ${NOTATION_E2E_RICH_ID}
T:Notation E2E Rich
M:6/8
L:1/8
K:G
B:e2e-notation
G A B | c3 |

`

const NOTATION_E2E_COPPER_ABC = `X:15
% abcbook-tune_id ${NOTATION_E2E_COPPER_ID}
T:Notation E2E Copper Kettle
M:4/4
L:1/8
K:D
B:e2e-notation
A2A2^F2BE| GGFE

`

const NOTATION_E2E_FULL_ABC = [
  NOTATION_E2E_BASIC_ABC,
  NOTATION_E2E_TWO_VOICE_ABC,
  NOTATION_E2E_MULTILINE_ABC,
  NOTATION_E2E_EMPTY_ABC,
  NOTATION_E2E_RICH_ABC,
  NOTATION_E2E_COPPER_ABC,
].join('\n')

function editorMusicUrl(base, tuneId) {
  const root = String(base || 'http://localhost:3000').replace(/\/$/, '')
  return root + '/#/editor/' + encodeURIComponent(tuneId) + '/music'
}

function editorHash(tuneId, view) {
  const tab = view || 'music'
  return '#/editor/' + encodeURIComponent(tuneId) + '/' + tab
}

module.exports = {
  NOTATION_E2E_TUNE_ID,
  NOTATION_E2E_TWO_VOICE_ID,
  NOTATION_E2E_MULTILINE_ID,
  NOTATION_E2E_EMPTY_ID,
  NOTATION_E2E_RICH_ID,
  NOTATION_E2E_COPPER_ID,
  NOTATION_E2E_BASIC_BODY,
  NOTATION_E2E_BASIC_ABC,
  NOTATION_E2E_TWO_VOICE_ABC,
  NOTATION_E2E_MULTILINE_ABC,
  NOTATION_E2E_RICH_ABC,
  NOTATION_E2E_COPPER_ABC,
  NOTATION_E2E_FULL_ABC,
  editorMusicUrl,
  editorHash,
}
