// Sample tunebook data for development and tests.
//
// This ABC is fed through the app's real parser (abcTools.abc2Tunebook) so the
// resulting tune objects have exactly the same shape as imported tunes. It
// deliberately covers the scenarios that keep breaking playback from the books
// page:
//   - MIDI-only tunes (ABC notes, no links)
//   - a tune whose first link is a YouTube video (the "playback jams" repro)
//   - a tune whose first link is a plain audio URL
//   - tunes spread across multiple books / tags / genres (G:) / artists (C:)
//
// Stable ids are provided via `% abcbook-tune_id` so tests can reference them.

export const SAMPLE_TUNE_IDS = {
  cooleys: '5eed00000000000000000001',
  keshJig: '5eed00000000000000000002',
  amazingGrace: '5eed00000000000000000003',
  siBheag: '5eed00000000000000000004',
  thisLand: '5eed00000000000000000005',
  swallowtail: '5eed00000000000000000006',
}

export const SAMPLE_TUNEBOOK_ABC = `X:1
% abcbook-tune_id ${SAMPLE_TUNE_IDS.cooleys}
T:Cooley's Reel
C:Traditional
G:reel
M:4/4
L:1/8
B:sample session
% abcbook-tags irish,reel,session
K:Edor
|:D2|EBBA B2 EB|B2 AB dBAG|FDAD BDAD|FDAD dAFD|
EBBA B2 EB|B2 AB defg|afge fdec|1 dAFD E2:|2 dAFD E2||

X:2
% abcbook-tune_id ${SAMPLE_TUNE_IDS.keshJig}
T:The Kesh Jig
C:Traditional
G:jig
M:6/8
L:1/8
B:sample session
% abcbook-tags irish,jig,session
K:G
|:G3 GAB|A2 A BAB|G3 GAB|ABG AGE|
G3 GAB|A2 A BAB|def gfe|1 dBA AGE:|2 dBA ABd||

X:3
% abcbook-tune_id ${SAMPLE_TUNE_IDS.amazingGrace}
T:Amazing Grace
C:John Newton
G:hymn
M:3/4
L:1/4
B:sample songs
% abcbook-tags hymn,vocal
% abcbook-link-0 https://www.youtube.com/watch?v=CDdvReNKKuk
% abcbook-link-title-0 Amazing Grace (YouTube)
% abcbook-link-1 https://example.com/audio/amazing-grace.mp3
% abcbook-link-title-1 Amazing Grace (audio)
K:C
"C"G2 c|"C"e3/2 c/ e|"G"d3|"C"e2 c|
"C"G2 c|"C"e3/2 c/ e|"G"d3|"C"c3|

X:4
% abcbook-tune_id ${SAMPLE_TUNE_IDS.siBheag}
T:Si Bheag Si Mhor
C:Turlough O'Carolan
G:folk
M:3/4
L:1/8
B:sample session
% abcbook-tags harp,folk
K:D
|:A2|d2 d2 e2|f2 e2 d2|B2 A2 F2|A4 A2|
d2 d2 e2|f2 e2 d2|e2 c2 A2|d4:|

X:5
% abcbook-tune_id ${SAMPLE_TUNE_IDS.thisLand}
T:This Land Is Your Land
C:Woody Guthrie
G:folk
M:4/4
L:1/8
B:sample songs
% abcbook-tags folk,vocal
% abcbook-link-0 https://example.com/audio/this-land.mp3
% abcbook-link-title-0 This Land (audio)
K:G
"G"D2 G2 G2 A2|"C"B2 G2 G4|"D"A2 F2 A2 B2|"G"G8|

X:6
% abcbook-tune_id ${SAMPLE_TUNE_IDS.swallowtail}
T:Swallowtail Jig
C:Traditional
G:jig
M:6/8
L:1/8
B:sample session
% abcbook-tags irish,jig,session
% abcbook-link-0 https://www.youtube.com/watch?v=nz9wSjZ0B_8
% abcbook-link-title-0 Swallowtail Jig (YouTube)
K:Edor
|:eBe e2f|edB A2B|eBe e2f|edB B2A|
eBe e2f|edB def|g2f gfe|dBA B2A:|
`

export default SAMPLE_TUNEBOOK_ABC
