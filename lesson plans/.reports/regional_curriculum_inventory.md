# Regional Traditions — Full Unit Inventory (Sketch)

Planning document for **Track B** regional units in the Celtic-style template:

- **8 national lessons** per unit (overview → instruments I/II → forms → dance → history → scenes → tunes)
- **5 diaspora / fringe lessons** per block
- **4 comparative capstone lessons** per block
- Every national lesson includes a **Compared with [anchor]** section linking parallel lesson IDs

**Lesson slot IDs** (suffix shared across all national units):

| Slot | Suffix | Standard title |
|------|--------|----------------|
| 1 | `01-overview` | Overview |
| 2 | `02-instruments-voices-i` | Traditional Voices I |
| 3 | `03-instruments-voices-ii` | Session & Social Voices II *(or Ensemble Voices II)* |
| 4 | `04-genres-forms` | Tunes, Forms, and Style |
| 5 | `05-dance` | Dance and Rhythm |
| 6 | `06-history` | History, Revival, and Transmission |
| 7 | `07-representative-depth` | Representative Fusions and Scenes |
| 8 | `08-tunes` | Tunes — Forms, History, and Recordings |

**Status:** Block A (Celtic) is implemented. Blocks B–K are planned.

---

## Block A — Celtic Music ✅ (implemented)

| Property | Value |
|----------|-------|
| Folder | `10-regions/celtic/` |
| Track label | Celtic Music |
| Anchor | **Ireland** (`celtic-ireland`) |
| Compare anchor | Ireland lessons (`regions-celtic-ireland-*`) |

### National units (8 lessons each)

| Unit | Region slug | Compared with |
|------|-------------|---------------|
| **Ireland** (anchor) | `ireland` | — (reference unit) |
| Scotland | `scotland` | Ireland → parallel `regions-celtic-ireland-{slot}` |
| Wales | `wales` | Ireland |
| Brittany | `brittany` | Ireland |

### Diaspora (`celtic-diaspora`, 5 lessons)

| # | ID suffix | Title | Compared with |
|---|-----------|-------|---------------|
| 1 | `01-cape-breton` | Cape Breton Fiddle and Dance | Ireland `03-instruments-voices-ii`, `05-dance`, `08-tunes` |
| 2 | `02-galicia-asturias` | Galicia & Asturias | Ireland pipes/fiddle; see Block F Iberian anchor |
| 3 | `03-cornwall-man` | Cornwall & Isle of Man | Ireland `06-history`, Wales harp |
| 4 | `04-pan-celtic-festivals` | Pan-Celtic Festivals and Institutions | Ireland `06-history`, Comhaltas |
| 5 | `05-listening-across-borders` | Listening Across Borders | Ireland `08-tunes`; comparative tune panel |

### Comparative (`celtic-comparative`, 4 lessons)

| # | ID suffix | Title |
|---|-----------|-------|
| 1 | `01-what-celtic-means` | What "Celtic Music" Means |
| 2 | `02-shared-instruments` | Shared Instruments Compared |
| 3 | `03-tune-forms-compared` | Tune Forms Compared |
| 4 | `04-revivals-compared` | Revivals Compared |

---

## Block B — British Isles Folk

| Property | Value |
|----------|-------|
| Folder | `10-regions/british-folk/` |
| Track label | British Isles Folk |
| Anchor | **England** (`british-england`) |
| Compare anchor | Ireland Celtic unit *and* England anchor (dual frame: "Compared with Ireland" + "Compared with England") |

*Pedagogy:* Neighbour to Celtic block. Sessions, morris, Northumbrian pipes, and English song revival. Ireland remains the student's first Atlantic-trad anchor; England is this block's internal reference.

### National units

#### England (anchor) — `regions-british-england-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | English Traditional Music — Overview | Ireland `01-overview` (session vs song/dance club) |
| 02 | Traditional Voices I — Fiddle, Pipes, Voice | Ireland `02-instruments-voices-i` |
| 03 | Ensemble Voices II — Concertina, Melodeon, Guitar | Ireland `03-instruments-voices-ii` |
| 04 | Tunes, Forms, and Style — Morris, Hornpipe, Ballad | Ireland `04-genres-forms` |
| 05 | Dance and Rhythm — Morris, Country Dance, Ceilidh Overlap | Ireland `05-dance` |
| 06 | History, Revival, and Transmission — Sharp, Vaughan Williams, EFDSS | Ireland `06-history` |
| 07 | Representative Fusions and Scenes — Folk-rock, clubs, festivals | Ireland `07-representative-depth` |
| 08 | Tunes — Forms, History, and Recordings | Ireland `08-tunes` |

#### Northumbria — `regions-british-northumbria-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Northumbrian Traditional Music — Overview | England `01-overview`; Ireland `01-overview` |
| 02 | Traditional Voices I — Smallpipes, Fiddle, Northumbrian Pipes | England `02`; Ireland pipes lesson |
| 03 | Ensemble Voices II — Piano, Guitar, Session Backing | England `03`; Ireland `03` |
| 04 | Tunes, Forms, and Style — Hornpipes, Jigs, Rants | England `04`; Ireland `04` |
| 05 | Dance and Rhythm — Rapper Sword, Social Dance | England `05`; Ireland `05` |
| 06 | History, Revival, and Transmission — Minstrelsy, Collectors | England `06`; Ireland `06` |
| 07 | Representative Fusions and Scenes — Tyneside, festivals | England `07` |
| 08 | Tunes — Forms, History, and Recordings | England `08`; Ireland `08` |

#### English Song & Ballad — `regions-british-song-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | English Song Tradition — Overview | Ireland sean-nós / ballad; England `01` |
| 02 | Traditional Voices I — Unaccompanied Voice, Concertina | Ireland `02`; Wales penillion |
| 03 | Ensemble Voices II — Guitar, Piano, Choir | England `03` |
| 04 | Tunes, Forms, and Style — Ballad, Broadside, Modal Song | Ireland `04` |
| 05 | Dance and Rhythm — Song-linked Dance, Social Context | England `05` |
| 06 | History, Revival, and Transmission — Collectors, Radio Ballads | Ireland `06`; England `06` |
| 07 | Representative Fusions and Scenes — Folk clubs, Topic Records | England `07` |
| 08 | Tunes — Forms, History, and Recordings | England `08` |

#### Morris & Country Dance — `regions-british-morris-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Morris and Country Dance — Overview | Ireland set dance; England `05-dance` |
| 02 | Traditional Voices I — Melodeon, Pipe & Tabor, Fiddle | England `02` |
| 03 | Ensemble Voices II — Band for Cotswold, Border, Northwest | England `03` |
| 04 | Tunes, Forms, and Style — Jigs, Polkas, Processional | Ireland `04` |
| 05 | Dance and Rhythm — Cotswold, Border, Molly, Longsword | Ireland `05`; Brittany fest-noz (circle vs side) |
| 06 | History, Revival, and Transmission — Sharp, revival sides | England `06` |
| 07 | Representative Fusions and Scenes — Alehouses, May Day, display | England `07` |
| 08 | Tunes — Forms, History, and Recordings | England `08` |

### Diaspora — `british-diaspora` (5 lessons)

| # | ID suffix | Title | Compared with |
|---|-----------|-------|---------------|
| 1 | `01-american-old-time-bridge` | English Ballads in Appalachia | Ireland diaspora; Block C anchor |
| 2 | `02-australian-bush` | Australian Bush Ballad and Folk | England `08-tunes`; Ireland song |
| 3 | `03-canadian-maritime-english` | Maritime English-Canadian Folk | Block D Quebec; Celtic Cape Breton |
| 4 | `04-efdss-network` | EFDSS, Cecil Sharp House, and Teaching Networks | England `06-history` |
| 5 | `05-listening-across-borders` | Listening Across the British Isles | Ireland `05-listening`; England anchor tunes |

### Comparative — `british-comparative` (4 lessons)

| # | ID suffix | Title | Cross-links |
|---|-----------|-------|-------------|
| 1 | `01-what-british-folk-means` | What "British Folk" Means vs Celtic | Celtic `01-what-celtic-means` |
| 2 | `02-shared-instruments` | Pipes, Fiddle, and Voice Compared | Celtic `02-shared-instruments` |
| 3 | `03-tune-forms-compared` | Hornpipe, Reel, and Morris Tune Forms | Celtic `03-tune-forms-compared` |
| 4 | `04-revivals-compared` | Sharp, Lomax, and Comhaltas Compared | Celtic `04-revivals-compared` |

---

## Block C — North American Roots

| Property | Value |
|----------|-------|
| Folder | `10-regions/north-american-roots/` |
| Track label | North American Roots |
| Anchor | **Appalachia / Old-Time** (`roots-appalachia`) |
| Compare anchor | Appalachia lessons; secondary frame: Ireland Celtic |

### National units

#### Appalachia / Old-Time (anchor) — `regions-roots-appalachia-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Appalachian Old-Time Music — Overview | Ireland `01-overview` (session vs porch/dance) |
| 02 | Traditional Voices I — Fiddle, Banjo, Voice | Ireland `02-instruments-voices-i` |
| 03 | Ensemble Voices II — Guitar, Bass, Clogging Rhythm | Ireland `03-instruments-voices-ii` |
| 04 | Tunes, Forms, and Style — Reels, Breakdowns, Ballads | Ireland `04-genres-forms` |
| 05 | Dance and Rhythm — Square, Clog, Flatfoot | Ireland `05-dance`; Cape Breton `01` |
| 06 | History, Revival, and Transmission — Lomax, 78s, festivals | Ireland `06-history` |
| 07 | Representative Fusions and Scenes — Bluegrass birth, camps | Ireland `07-representative-depth` |
| 08 | Tunes — Forms, History, and Recordings | Ireland `08-tunes`; `Soldier's Joy`, `Cripple Creek` |

#### Bluegrass — `regions-roots-bluegrass-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Bluegrass Music — Overview | Appalachia `01`; Ireland ensemble density |
| 02 | Traditional Voices I — Fiddle, Mandolin, Banjo | Appalachia `02` |
| 03 | Ensemble Voices II — Guitar, Bass, Dobro | Appalachia `03` |
| 04 | Tunes, Forms, and Style — Breakdown, Gospel, Song | Appalachia `04` |
| 05 | Dance and Rhythm — Stage vs Dance Floor | Appalachia `05` |
| 06 | History, Revival, and Transmission — Monroe, festivals | Appalachia `06` |
| 07 | Representative Fusions and Scenes — Festivals, jam culture | Appalachia `07` |
| 08 | Tunes — Forms, History, and Recordings | Appalachia `08` |

#### Quebec / French-Canadian — `regions-roots-quebec-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Quebecois Traditional Music — Overview | Appalachia `01`; Brittany accordion |
| 02 | Traditional Voices I — Fiddle, Foot Percussion | Appalachia `02`; Ireland fiddle |
| 03 | Ensemble Voices II — Piano, Guitar, Accordion | Block D Quebec; Ireland `03` |
| 04 | Tunes, Forms, and Style — Reels, Jigs, Quadrilles | Appalachia `04`; Ireland `04` |
| 05 | Dance and Rhythm — Quadrille, Podorythmie | Appalachia `05`; Brittany `05` |
| 06 | History, Revival, and Transmission — Carignan, archives | Appalachia `06` |
| 07 | Representative Fusions and Scenes — Festivals, crooked tunes | Appalachia `07` |
| 08 | Tunes — Forms, History, and Recordings | Appalachia `08`; `Reel de Saint-Antoine` |

#### Cajun & Creole — `regions-roots-cajun-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Cajun & Creole Music — Overview | Quebec `01`; Appalachia `01` |
| 02 | Traditional Voices I — Fiddle, Accordion, Voice | Quebec `02` |
| 03 | Ensemble Voices II — Guitar, Triangle, Drums | Quebec `03` |
| 04 | Tunes, Forms, and Style — Two-step, Waltz, Zydeco overlap | Quebec `04` |
| 05 | Dance and Rhythm — Fais do-do, Dance Hall | Quebec `05` |
| 06 | History, Revival, and Transmission — Arcadian exile, revival | Quebec `06`; Block D |
| 07 | Representative Fusions and Scenes — Festivals, swamp pop border | Quebec `07` |
| 08 | Tunes — Forms, History, and Recordings | Quebec `08` |

#### New England Contra — `regions-roots-contra-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | New England Contra Dance Music — Overview | Appalachia `01`; England morris |
| 02 | Traditional Voices I — Fiddle, Piano | Appalachia `02` |
| 03 | Ensemble Voices II — Piano, Guitar, Band | Appalachia `03` |
| 04 | Tunes, Forms, and Style — Reels, Quadrilles, Composed | Appalachia `04` |
| 05 | Dance and Rhythm — Contra, Square, Caller Role | Appalachia `05`; England morris |
| 06 | History, Revival, and Transmission — Dudley Laufman era, camps | Appalachia `06` |
| 07 | Representative Fusions and Scenes — Camp culture, fusion bands | Appalachia `07` |
| 08 | Tunes — Forms, History, and Recordings | Appalachia `08` |

### Diaspora — `roots-diaspora` (5 lessons)

| # | ID suffix | Title | Compared with |
|---|-----------|-------|---------------|
| 1 | `01-urban-folk-revival` | Urban Folk Revival (NY, Chicago) | Ireland `06-history`; O'Neill collectors |
| 2 | `02-western-swing-bridge` | Western Swing and Country Fiddle Bridge | Appalachia `02`; bluegrass `01` |
| 3 | `03-mexican-border-influence` | Norteño and Border Instrumentation | Block H Latin anchor |
| 4 | `04-camp-and-festival-circuit` | Ashokan, Wheatland, Festival Networks | Appalachia `07` |
| 5 | `05-listening-across-borders` | Old-Time vs Irish Session Listening Lab | Celtic `05-listening`; Appalachia `08` |

### Comparative — `roots-comparative` (4 lessons)

| # | ID suffix | Title | Cross-links |
|---|-----------|-------|-------------|
| 1 | `01-what-old-time-means` | What "Old-Time" Means vs Bluegrass vs Celtic | Celtic comparative `01` |
| 2 | `02-shared-instruments` | Fiddle, Banjo, and Guitar Compared | Celtic `02`; England `02` |
| 3 | `03-tune-forms-compared` | Breakdown, Reel, and Crooked Tune Forms | Celtic `03` |
| 4 | `04-revivals-compared` | Lomax, Seeger, and Folk Revival Archives | Celtic `04`; England `06` |

---

## Block D — French & Acadian World

| Property | Value |
|----------|-------|
| Folder | `10-regions/french-acadian/` |
| Track label | French & Acadian Folk |
| Anchor | **Quebec** (`french-quebec`) |
| Compare anchor | Quebec lessons; secondary: Brittany (Celtic), Appalachia/roots |

### National units

#### Quebec (anchor) — `regions-french-quebec-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Quebecois Traditional Music — Overview | Roots Quebec `01`; Brittany `01` |
| 02 | Traditional Voices I — Fiddle, Voice | Roots Quebec `02`; Ireland fiddle |
| 03 | Ensemble Voices II — Piano, Guitar, Accordion | Roots Quebec `03`; Brittany `03` |
| 04 | Tunes, Forms, and Style — Reels, Jigs, Quadrilles | Roots Quebec `04` |
| 05 | Dance and Rhythm — Quadrille, Podorythmie | Brittany `05-dance` |
| 06 | History, Revival, and Transmission — Carignan, archives | Roots Quebec `06` |
| 07 | Representative Fusions and Scenes — Festivals, crooked tunes | Roots Quebec `07` |
| 08 | Tunes — Forms, History, and Recordings | Roots Quebec `08` |

#### Acadian — `regions-french-acadian-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Acadian Traditional Music — Overview | Quebec `01` |
| 02 | Traditional Voices I — Fiddle, Voice | Quebec `02` |
| 03 | Ensemble Voices II — Guitar, Piano | Quebec `03` |
| 04 | Tunes, Forms, and Style | Quebec `04` |
| 05 | Dance and Rhythm | Quebec `05` |
| 06 | History, Revival, and Transmission — Deportation, revival | Quebec `06` |
| 07 | Representative Fusions and Scenes | Quebec `07` |
| 08 | Tunes — Forms, History, and Recordings | Quebec `08` |

#### Louisiana Cajun — `regions-french-cajun-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | *(mirror Roots Cajun unit titles)* | Roots `regions-roots-cajun-*`; Quebec anchor |

#### Occitan & Southern France — `regions-french-occitan-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Occitan Folk Music — Overview | Brittany `01`; Quebec `01` |
| 02 | Traditional Voices I — Bodega, Voice, Flute | Brittany bombard; Ireland flute |
| 03 | Ensemble Voices II — Accordion, Guitar | Brittany `03` |
| 04 | Tunes, Forms, and Style — Ball, Couplet, Dance Airs | Brittany `04` |
| 05 | Dance and Rhythm — Farandole, Bal | Brittany fest-noz |
| 06 | History, Revival, and Transmission | Brittany `06` |
| 07 | Representative Fusions and Scenes | Brittany `07` |
| 08 | Tunes — Forms, History, and Recordings | Brittany `08` |

#### Basque — `regions-french-basque-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Basque Traditional Music — Overview | Celtic diaspora Galicia `02`; Iberian block |
| 02 | Traditional Voices I — Txistu, Voice, Accordion | Galicia gaita; Ireland pipes |
| 03 | Ensemble Voices II — Tamboril, Guitar | Galicia ensemble |
| 04 | Tunes, Forms, and Style | Iberian `04` |
| 05 | Dance and Rhythm — Aurresku, Social Dance | Ireland `05` |
| 06 | History, Revival, and Transmission | Galicia `02` history threads |
| 07 | Representative Fusions and Scenes | Iberian fusion |
| 08 | Tunes — Forms, History, and Recordings | Galicia tune studies |

### Diaspora — `french-diaspora` (5 lessons)

| # | ID suffix | Title | Compared with |
|---|-----------|-------|---------------|
| 1 | `01-franco-american` | Franco-American Communities (New England) | Quebec `01`; Roots contra |
| 2 | `02-louisiana-zydeco-bridge` | Zydeco and Creole Overlap | Cajun `01` |
| 3 | `03-metis-fiddle` | Métis Fiddle Tradition | Quebec `02`; Celtic fiddle |
| 4 | `04-festival-networks` | Francophone Festival Circuits | Quebec `07` |
| 5 | `05-listening-across-borders` | French Atlantic Listening Lab | Celtic `05-listening` |

### Comparative — `french-comparative` (4 lessons)

| # | ID suffix | Title | Cross-links |
|---|-----------|-------|-------------|
| 1 | `01-what-francophone-folk-means` | Francophone Folk vs Celtic Labels | Celtic `01` |
| 2 | `02-shared-instruments` | Accordion and Fiddle Across French Worlds | Celtic `02`; Roots `02` |
| 3 | `03-tune-forms-compared` | Quadrille, Gavotte, and Reel | Celtic `03`; Brittany |
| 4 | `04-revivals-compared` | Revival and Archive Compared | Celtic `04` |

---

## Block E — Nordic & Scandinavian Folk

| Property | Value |
|----------|-------|
| Folder | `10-regions/nordic/` |
| Track label | Nordic Folk |
| Anchor | **Norway** (`nordic-norway`) |
| Compare anchor | Norway lessons; secondary: Ireland fiddle/pipes |

### National units

#### Norway (anchor) — `regions-nordic-norway-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Norwegian Folk Music — Overview | Ireland `01-overview` |
| 02 | Traditional Voices I — Hardanger Fiddle, Langeleik, Voice | Ireland `02`; Scotland fiddle |
| 03 | Ensemble Voices II — Accordion, Guitar, Ensemble | Ireland `03` |
| 04 | Tunes, Forms, and Style — Slått, Pols, Halling | Ireland `04`; Scotland strathspey |
| 05 | Dance and Rhythm — Halling, Springar, Social Dance | Ireland `05` |
| 06 | History, Revival, and Transmission — Collectors, GRAPA | Ireland `06` |
| 07 | Representative Fusions and Scenes — Concerts, festivals | Ireland `07` |
| 08 | Tunes — Forms, History, and Recordings | Ireland `08`; `Fanitullen` |

#### Sweden — `regions-nordic-sweden-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Swedish Folk Music — Overview | Norway `01` |
| 02 | Traditional Voices I — Nyckelharpa, Fiddle | Norway `02` |
| 03 | Ensemble Voices II — Accordion, Guitar | Norway `03` |
| 04 | Tunes, Forms, and Style — Polska, Schottis, Waltz | Norway `04` |
| 05 | Dance and Rhythm — Polska, Hambo | Norway `05` |
| 06 | History, Revival, and Transmission — Spelmansstämma | Norway `06` |
| 07 | Representative Fusions and Scenes — Falun, fusion | Norway `07` |
| 08 | Tunes — Forms, History, and Recordings | Norway `08` |

#### Denmark — `regions-nordic-denmark-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Danish Folk — *(standard slot titles)* | Norway anchor parallel slots |

#### Finland — `regions-nordic-finland-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Finnish Folk — *(standard slot titles)* | Norway anchor; runo song vs Ireland sean-nós in `04` |

#### Iceland & Faroe — `regions-nordic-islands-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | North Atlantic Island Traditions | Norway `01`; Celtic Shetland/Scotland |

#### Sámi — `regions-nordic-sami-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Sámi Music — Overview | Norway `01`; joik vs sean-nós |
| 02 | Traditional Voices I — Joik, Fiddle | Norway `02` |
| 03 | Ensemble Voices II — Contemporary Ensemble | Norway `03` |
| 04 | Tunes, Forms, and Style — Joik Types | Norway `04` |
| 05 | Dance and Rhythm — Ritual and Social Context | Norway `05` |
| 06 | History, Revival, and Transmission — Rights, revival | Norway `06` |
| 07 | Representative Fusions and Scenes — Festival, fusion | Norway `07` |
| 08 | Tunes — Forms, History, and Recordings | Norway `08` |

### Diaspora — `nordic-diaspora` (5 lessons)

| # | ID suffix | Title | Compared with |
|---|-----------|-------|---------------|
| 1 | `01-nordic-america` | Nordic-American Fiddle and Dance | Appalachia `01`; Norway `02` |
| 2 | `02-minnesota-swedish` | Upper Midwest Swedish Traditions | Sweden `01` |
| 3 | `03-plains-scandinavian` | Plains Scandinavian Communities | Norway `06` |
| 4 | `04-festival-networks` | Nordic Folk Festivals Abroad | Norway `07` |
| 5 | `05-listening-across-borders` | Nordic Fiddle Listening Lab | Celtic `05-listening`; Norway `08` |

### Comparative — `nordic-comparative` (4 lessons)

| # | ID suffix | Title | Cross-links |
|---|-----------|-------|-------------|
| 1 | `01-what-nordic-folk-means` | Nordic Folk Labels vs Celtic Marketing | Celtic `01` |
| 2 | `02-shared-instruments` | Hardanger, Fiddle, and Pipes Compared | Celtic `02` |
| 3 | `03-tune-forms-compared` | Polska, Slått, and Reel Families | Celtic `03` |
| 4 | `04-revivals-compared` | Spelmansstämma vs Fleadh vs Fest-noz | Celtic `04` |

---

## Block F — Iberian Folk

| Property | Value |
|----------|-------|
| Folder | `10-regions/iberian/` |
| Track label | Iberian Folk |
| Anchor | **Galicia** (`iberian-galicia`) — extends Celtic diaspora lesson |
| Compare anchor | Galicia lessons; secondary: Ireland, Celtic diaspora `02` |

### National units

#### Galicia (anchor) — `regions-iberian-galicia-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Galician Traditional Music — Overview | Celtic diaspora `02-galicia-asturias`; Ireland `01` |
| 02 | Traditional Voices I — Gaita, Fiddle, Voice | Ireland pipes `02`; Celtic diaspora `02` |
| 03 | Ensemble Voices II — Percussion, Guitar, Band | Ireland `03` |
| 04 | Tunes, Forms, and Style — Muiñeira, Alborada | Ireland `04` |
| 05 | Dance and Rhythm — Muiñeira, Parade Context | Ireland `05`; Brittany `05` |
| 06 | History, Revival, and Transmission | Celtic diaspora `02`; Ireland `06` |
| 07 | Representative Fusions and Scenes | Ireland `07` |
| 08 | Tunes — Forms, History, and Recordings | Ireland `08` |

#### Asturias — `regions-iberian-asturias-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Asturian Traditional Music — *(standard slots)* | Galicia anchor parallel |

#### Portugal — `regions-iberian-portugal-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Portuguese Folk Music — Overview | Galicia `01` |
| 02 | Traditional Voices I — Guitarra, Voice, Bagpipe | Galicia `02` |
| 03 | Ensemble Voices II — Accordion, Percussion | Galicia `03` |
| 04 | Tunes, Forms, and Style — Vira, Chula, Fado vs Folk | Galicia `04`; fado in `07` |
| 05 | Dance and Rhythm — Circle and Social Dance | Galicia `05` |
| 06 | History, Revival, and Transmission | Galicia `06` |
| 07 | Representative Fusions and Scenes — Fado, folk revival | Galicia `07` |
| 08 | Tunes — Forms, History, and Recordings | Galicia `08` |

#### Andalusia / Flamenco — `regions-iberian-flamenco-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Flamenco — Overview (as regional practice) | Galicia `01`; not "Celtic" frame |
| 02 | Traditional Voices I — Cante, Guitar | Ireland song `02`; Iberian voice |
| 03 | Ensemble Voices II — Palmas, Percussion, Ensemble | Galicia `03` |
| 04 | Tunes, Forms, and Style — Palos, Compás | Ireland `04`; asymmetric rhythm intro |
| 05 | Dance and Rhythm — Zapateado, Braceo | Ireland `05` |
| 06 | History, Revival, and Transmission — Cafés cantantes, revival | Galicia `06` |
| 07 | Representative Fusions and Scenes — Fusion, tablaos, festivals | Galicia `07` |
| 08 | Tunes — Forms, History, and Recordings | Soleá/Bulerías listening study |

#### Castile & Catalan Folk — `regions-iberian-castile-catalan-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Central and Catalan Folk — *(standard slots)* | Galicia anchor; Basque (Block D) |

### Diaspora — `iberian-diaspora` (5 lessons)

| # | ID suffix | Title | Compared with |
|---|-----------|-------|---------------|
| 1 | `01-latin-america-galician` | Galician Diaspora in Latin America | Block H; Galicia `01` |
| 2 | `02-flamenco-global` | Global Flamenco Networks | Flamenco `07` |
| 3 | `03-portuguese-diaspora` | Lusophone Folk Diaspora | Portugal `01` |
| 4 | `04-pan-iberian-festivals` | Inter-Celtic and Iberian Festivals | Celtic `04-pan-celtic-festivals` |
| 5 | `05-listening-across-borders` | Iberian Atlantic Listening Lab | Celtic `05-listening` |

### Comparative — `iberian-comparative` (4 lessons)

| # | ID suffix | Title | Cross-links |
|---|-----------|-------|-------------|
| 1 | `01-celtic-fringe-vs-iberian` | Celtic Fringe vs Iberian Northwest | Celtic `01` |
| 2 | `02-shared-instruments` | Bagpipes and Fiddle on the Atlantic Rim | Celtic `02` |
| 3 | `03-tune-forms-compared` | Muiñeira, Jig, and Gavotte | Celtic `03` |
| 4 | `04-revivals-compared` | Revivals on the Peninsula | Celtic `04` |

---

## Block G — Eastern European & Baltic Folk

| Property | Value |
|----------|-------|
| Folder | `10-regions/eastern-europe/` |
| Track label | Eastern European Folk |
| Anchor | **Hungary** (`east-hungary`) |
| Compare anchor | Hungary lessons; secondary: Ireland (metre contrast) |

### National units

#### Hungary (anchor) — `regions-east-hungary-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Hungarian Folk Music — Overview | Ireland `01` (metre and village context) |
| 02 | Traditional Voices I — Violin, Voice, Shepherd Flute | Ireland `02` |
| 03 | Ensemble Voices II — Cimbalom, Bass | Ireland `03` |
| 04 | Tunes, Forms, and Style — Csárdás, Verbunkos, Asymmetric Metre | Ireland `04` |
| 05 | Dance and Rhythm — Couple Dance, Village Circle | Ireland `05` |
| 06 | History, Revival, and Transmission — Bartók, Kodály collecting | Ireland `06` |
| 07 | Representative Fusions and Scenes — Táncház, folk-rock | Ireland `07` |
| 08 | Tunes — Forms, History, and Recordings | Ireland `08` |

#### Balkans — `regions-east-balkans-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Balkan Folk Music — Overview | Hungary `01` |
| 02 | Traditional Voices I — Gaida, Gadulka, Voice | Hungary `02`; Ireland pipes |
| 03 | Ensemble Voices II — Tambura, Accordion | Hungary `03` |
| 04 | Tunes, Forms, and Style — Horo, Odd Metres | Hungary `04` |
| 05 | Dance and Rhythm — Line and Circle Dance | Hungary `05` |
| 06 | History, Revival, and Transmission | Hungary `06` |
| 07 | Representative Fusions and Scenes | Hungary `07` |
| 08 | Tunes — Forms, History, and Recordings | Hungary `08` |

#### Klezmer — `regions-east-klezmer-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Klezmer Music — Overview | Hungary `01`; diaspora frame |
| 02 | Traditional Voices I — Clarinet, Violin, Voice | Hungary `02`; Ireland fiddle |
| 03 | Ensemble Voices II — Accordion, Bass, Tsimbl | Hungary `03` |
| 04 | Tunes, Forms, and Style — Freylekhs, Dobriden | Hungary `04` |
| 05 | Dance and Rhythm — Wedding and Social Dance | Hungary `05` |
| 06 | History, Revival, and Transmission — Immigration, revival | Hungary `06` |
| 07 | Representative Fusions and Scenes — Festival, fusion | Hungary `07` |
| 08 | Tunes — Forms, History, and Recordings | Hungary `08` |

#### Poland — `regions-east-poland-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Polish Folk — *(standard slots)* | Hungary anchor |

#### Baltic States — `regions-east-baltic-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Baltic Folk — *(standard slots)* | Hungary anchor; Nordic Block E overlap in `02` |

### Diaspora — `east-diaspora` (5 lessons)

| # | ID suffix | Title | Compared with |
|---|-----------|-------|---------------|
| 1 | `01-klezmer-america` | Klezmer in North America | Klezmer `01`; Roots urban revival |
| 2 | `02-balkan-diaspora` | Balkan Communities in Western Europe | Balkans `01` |
| 3 | `03-hungarian-diaspora` | Hungarian Diaspora Ensembles | Hungary `07` |
| 4 | `04-festival-networks` | Balkan/Klezmer Camp Culture | Hungary `07` |
| 5 | `05-listening-across-borders` | Metre and Ornament Listening Lab | Celtic `05-listening` |

### Comparative — `east-comparative` (4 lessons)

| # | ID suffix | Title | Cross-links |
|---|-----------|-------|-------------|
| 1 | `01-what-eastern-european-folk-means` | Village Folk vs Concert Folk | Celtic `01` |
| 2 | `02-shared-instruments` | Fiddle, Bagpipe, Accordion Compared | Celtic `02` |
| 3 | `03-tune-forms-compared` | Odd Metre vs Jig/Reel Default | Celtic `03` |
| 4 | `04-revivals-compared` | Bartók/Kodály vs Collectors in Ireland | Celtic `04` |

---

## Block H — Latin American Folk

| Property | Value |
|----------|-------|
| Folder | `10-regions/latin-america/` |
| Track label | Latin American Folk |
| Anchor | **Mexico** (`latin-mexico`) |
| Compare anchor | Mexico lessons; secondary: Iberian, Roots |

### National units

#### Mexico (anchor) — `regions-latin-mexico-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Mexican Folk Music — Overview | Iberian `01`; Roots border `03` |
| 02 | Traditional Voices I — Violin, Voice, Harp | Ireland `02`; Appalachia fiddle |
| 03 | Ensemble Voices II — Guitar, Vihuela, Percussion | Iberian `03` |
| 04 | Tunes, Forms, and Style — Son, Huapango, Corrido | Ireland `04` |
| 05 | Dance and Rhythm — Zapateado, Social Dance | Iberian `05` |
| 06 | History, Revival, and Transmission — Regional archives | Ireland `06` |
| 07 | Representative Fusions and Scenes — Mariachi vs village son | Iberian `07` |
| 08 | Tunes — Forms, History, and Recordings | `La Bamba`, `Cielito Lindo` studies |

#### Andes — `regions-latin-andes-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Andean Folk Music — Overview | Mexico `01` |
| 02 | Traditional Voices I — Quena, Charango, Voice | Mexico `02` |
| 03 | Ensemble Voices II — Bombo, Guitar | Mexico `03` |
| 04 | Tunes, Forms, and Style — Huayno, Sikuri | Mexico `04` |
| 05 | Dance and Rhythm — Community Festival | Mexico `05` |
| 06 | History, Revival, and Transmission — Indigenous revival | Mexico `06` |
| 07 | Representative Fusions and Scenes — Nueva canción | Mexico `07` |
| 08 | Tunes — Forms, History, and Recordings | Mexico `08` |

#### Brazil — `regions-latin-brazil-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Brazilian Folk Roots — *(standard slots)* | Mexico anchor; samba/forró in `07` |

#### Caribbean — `regions-latin-caribbean-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Caribbean Folk — *(standard slots)* | Mexico anchor; African diaspora Block K |

#### Southern Cone — `regions-latin-southern-cone-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Southern Cone Folk — *(standard slots)* | Mexico anchor; tango/chacarera in `04`/`05` |

### Diaspora — `latin-diaspora` (5 lessons)

| # | ID suffix | Title | Compared with |
|---|-----------|-------|---------------|
| 1 | `01-chicano-folk` | Chicano and Border Folk | Mexico `01`; Roots `03` |
| 2 | `02-andean-diaspora` | Andean Music Abroad | Andes `01` |
| 3 | `03-brazilian-diaspora` | Brazilian Diaspora Scenes | Brazil `01` |
| 4 | `04-festival-networks` | Latin Folk Festivals | Mexico `07` |
| 5 | `05-listening-across-borders` | Americas Listening Lab | Celtic `05-listening` |

### Comparative — `latin-comparative` (4 lessons)

| # | ID suffix | Title | Cross-links |
|---|-----------|-------|-------------|
| 1 | `01-folk-vs-popular-labels` | Folk, Popular, and Roots Labels | Celtic `01` |
| 2 | `02-shared-instruments` | Guitar, Violin, Percussion Compared | Celtic `02`; Iberian `02` |
| 3 | `03-tune-forms-compared` | Son, Huayno, and Dance Forms | Celtic `03` |
| 4 | `04-revivals-compared` | Nueva Canción and Folk Revivals | Celtic `04` |

---

## Block I — Middle Eastern & Mediterranean

| Property | Value |
|----------|-------|
| Folder | `10-regions/middle-east/` |
| Track label | Middle Eastern & Mediterranean Folk |
| Anchor | **Turkey** (`me-turkey`) |
| Compare anchor | Turkey lessons; secondary: Ireland (mode vs major/minor folk) |

*Template tweak:* Lesson 04 emphasises **maqam / mode** and **rhythm cycles**; lesson 03 may be **Ensemble & Percussion** rather than "session."

### National units

#### Turkey (anchor) — `regions-me-turkey-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Turkish Folk Music — Overview | Ireland `01` (social context) |
| 02 | Traditional Voices I — Bağlama, Kemençe, Voice | Ireland `02` |
| 03 | Ensemble & Percussion — Davul, Zurna, Ensemble | Ireland `03` |
| 04 | Maqam, Modes, and Forms — Türkü, Halay | Ireland `04`; theory modes |
| 05 | Dance and Rhythm — Halay, Horon, Social Dance | Ireland `05` |
| 06 | History, Revival, and Transmission — Radio, archives | Ireland `06` |
| 07 | Representative Fusions and Scenes — Arabesk, fusion, festivals | Ireland `07` |
| 08 | Tunes — Forms, History, and Recordings | Türkü listening studies |

#### Levant — `regions-me-levant-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Levantine Folk — *(standard slots)* | Turkey `01`; oud focus in `02` |

#### North Africa (Maghreb) — `regions-me-maghreb-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Maghreb Folk — *(standard slots)* | Turkey `01`; Andalusian legacy link Iberian |

#### Greece — `regions-me-greece-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Greek Folk — *(standard slots)* | Turkey `01`; Balkans Block G |

#### Persia / Iran — `regions-me-persia-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Persian Classical & Folk — *(standard slots)* | Turkey `04` maqam; radif in `06` |

### Diaspora — `me-diaspora` (5 lessons)

| # | ID suffix | Title | Compared with |
|---|-----------|-------|---------------|
| 1 | `01-ottoman-diaspora` | Ottoman and Balkan Overlap | Block G Balkans |
| 2 | `02-arab-american` | Arab-American Folk Scenes | Levant `01` |
| 3 | `03-rebetiko-diaspora` | Rebetiko and Urban Diaspora | Greece `01` |
| 4 | `04-festival-networks` | Mediterranean Folk Festivals | Turkey `07` |
| 5 | `05-listening-across-borders` | Maqam and Mode Listening Lab | Celtic `05-listening`; theory modes |

### Comparative — `me-comparative` (4 lessons)

| # | ID suffix | Title | Cross-links |
|---|-----------|-------|-------------|
| 1 | `01-what-middle-eastern-folk-means` | Folk vs Classical vs Popular | Celtic `01` |
| 2 | `02-shared-instruments` | Oud, Fiddle, Bagpipe Compared | Celtic `02` |
| 3 | `03-tune-forms-compared` | Maqam, Mode, and Metre vs Jig/Reel | Celtic `03` |
| 4 | `04-revivals-compared` | Archives and National Radio Compared | Celtic `04` |

---

## Block J — East Asian Traditions

| Property | Value |
|----------|-------|
| Folder | `10-regions/east-asia/` |
| Track label | East Asian Traditions |
| Anchor | **Japan** (`asia-japan`) |
| Compare anchor | Japan lessons; secondary: Ireland (transmission contrast) |

*Template tweak:* Lesson 03 = **Ensemble & Accompaniment**; lesson 06 = **lineage and teacher-student transmission** (not collector/revival only).

### National units

#### Japan (anchor) — `regions-asia-japan-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Japanese Traditional Music — Overview | Ireland `01` (transmission contrast) |
| 02 | Traditional Voices I — Shakuhachi, Shamisen, Voice | Ireland `02` |
| 03 | Ensemble & Accompaniment — Koto, Percussion, Ensemble | Ireland `03` |
| 04 | Forms and Style — Honkyoku, Min'yō, Regional Song | Ireland `04` |
| 05 | Dance and Rhythm — Noh, Bon Odori, Folk Dance | Ireland `05` |
| 06 | Lineage, Revival, and Transmission — Iemoto, folk revivals | Ireland `06` |
| 07 | Representative Fusions and Scenes — Min'yō revival, festivals | Ireland `07` |
| 08 | Repertoire — Forms, History, and Recordings | Min'yō tune studies |

#### China — `regions-asia-china-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Chinese Folk & Regional Traditions — *(standard slots)* | Japan `01`; erhu/guzheng in `02` |

#### Korea — `regions-asia-korea-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Korean Folk Music — *(standard slots)* | Japan `01`; pansori in `02` |

#### Mongolia & Central Asia — `regions-asia-mongolia-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Mongolian & Steppe Traditions — *(standard slots)* | Japan `01`; throat singing in `02` |

#### Southeast Asia (mainland) — `regions-asia-mainland-se-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Mainland Southeast Asian Folk — *(standard slots)* | Japan anchor; piphat overlap in `03` |

### Diaspora — `asia-diaspora` (5 lessons)

| # | ID suffix | Title | Compared with |
|---|-----------|-------|---------------|
| 1 | `01-nikkei-brazil` | Japanese Diaspora in Brazil | Block H Brazil; Japan `01` |
| 2 | `02-chinese-american` | Chinese-American Folk Practice | China `01` |
| 3 | `03-korean-diaspora` | Korean Diaspora Music | Korea `01` |
| 4 | `04-festival-networks` | East Asian Heritage Festivals | Japan `07` |
| 5 | `05-listening-across-borders` | East Asia Listening Lab | Celtic `05-listening` |

### Comparative — `asia-comparative` (4 lessons)

| # | ID suffix | Title | Cross-links |
|---|-----------|-------|-------------|
| 1 | `01-tradition-vs-heritage` | Living Tradition vs Heritage Performance | Celtic `01` |
| 2 | `02-shared-instruments` | Fiddle, Flute, Zither Compared | Celtic `02` |
| 3 | `03-forms-compared` | Pentatonic, Min'yō, and Folk Metre | Celtic `03` |
| 4 | `04-transmission-compared` | Lineage vs Session Transmission | Celtic `04` |

---

## Block K — South Asian Traditions

| Property | Value |
|----------|-------|
| Folder | `10-regions/south-asia/` |
| Track label | South Asian Traditions |
| Anchor | **North India / Hindustani** (`asia-india-hindustani`) |
| Compare anchor | Hindustani lessons; Carnatic as sibling; Ireland as oral-trad contrast |

*Template tweak:* Split **Hindustani** and **Carnatic** as two national units; lesson 04 = **raga and tala**; lesson 08 = **bandish / kriti** studies.

### National units

#### Hindustani (anchor) — `regions-asia-hindustani-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Hindustani Music — Overview | Ireland `01`; Carnatic `01` |
| 02 | Traditional Voices I — Sitar, Sarod, Voice | Ireland `02` |
| 03 | Ensemble & Accompaniment — Tabla, Tanpura, Harmonium | Ireland `03` |
| 04 | Raga, Tala, and Form | Ireland `04`; theory modes |
| 05 | Dance and Rhythm — Kathak, Tala in Practice | Ireland `05` |
| 06 | Lineage, Revival, and Transmission — Gharana, All-India Radio | Ireland `06` |
| 07 | Representative Fusions and Scenes — Fusion, festivals | Ireland `07` |
| 08 | Repertoire — Bandish and Recordings | Raga listening studies |

#### Carnatic — `regions-asia-carnatic-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Carnatic Music — *(parallel slot titles)* | Hindustani anchor every slot |

#### Folk & Tribal India — `regions-asia-india-folk-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Indian Regional Folk — *(standard slots)* | Hindustani `01`; village vs concert |

#### Pakistan & Afghanistan — `regions-asia-northwest-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Northwest South Asian Folk — *(standard slots)* | Hindustani `01`; Block I overlap |

#### Bangladesh & Bengal — `regions-asia-bengal-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Bengali Folk — *(standard slots)* | Hindustani `01`; Baul in `02` |

### Diaspora — `south-asia-diaspora` (5 lessons)

| # | ID suffix | Title | Compared with |
|---|-----------|-------|---------------|
| 1 | `01-bhangra-diaspora` | Bhangra and British Asian Scenes | India folk `01`; UK Blocks B/C |
| 2 | `02-bollywood-bridge` | Film Music and Folk Bridge | Hindustani `07` |
| 3 | `03-carnatic-diaspora` | Carnatic Diaspora Communities | Carnatic `01` |
| 4 | `04-festival-networks` | South Asian Heritage Festivals | Hindustani `07` |
| 5 | `05-listening-across-borders` | Raga and Tune Form Listening Lab | Celtic `05-listening` |

### Comparative — `south-asia-comparative` (4 lessons)

| # | ID suffix | Title | Cross-links |
|---|-----------|-------|-------------|
| 1 | `01-classical-vs-folk-labels` | Classical, Folk, and Devotional | Celtic `01` |
| 2 | `02-shared-instruments` | Drone, Fiddle, Voice Compared | Celtic `02` |
| 3 | `03-forms-compared` | Raga/Tala vs Tune Type | Celtic `03` |
| 4 | `04-transmission-compared` | Gharana vs Oral Session | Celtic `04` |

---

## Block L — West African Roots

| Property | Value |
|----------|-------|
| Folder | `10-regions/west-africa/` |
| Track label | West African Roots |
| Anchor | **Mali / Mande** (`africa-mali`) |
| Compare anchor | Mali lessons; secondary: Ireland (transmission); Blocks C/H/K (diaspora) |

*Template tweak:* Lesson 02 = **master musicians**; lesson 05 = **dance and ceremony**; lesson 06 = **colonialism and diaspora**.

### National units

#### Mali / Mande (anchor) — `regions-africa-mali-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01 | Mande Music — Overview | Ireland `01`; griot role vs bard |
| 02 | Traditional Voices I — Kora, Ngoni, Voice | Ireland harp `02` |
| 03 | Ensemble & Percussion — Balafon, Djembe Ensemble | Ireland `03` |
| 04 | Forms and Style — Jaliya, Song Forms | Ireland `04` |
| 05 | Dance and Ceremony — Rhythm and Occasion | Ireland `05` |
| 06 | History, Diaspora, and Transmission — Empire, recording | Ireland `06` |
| 07 | Representative Fusions and Scenes — Afropop, festivals | Ireland `07` |
| 08 | Repertoire — Forms, History, and Recordings | Kora piece studies |

#### Guinea & Senegambia — `regions-africa-guinea-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Guinea & Senegambia — *(standard slots)* | Mali anchor |

#### Ghana — `regions-africa-ghana-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Ghanaian Traditions — *(standard slots)* | Mali anchor; highlife in `07` |

#### Nigeria — `regions-africa-nigeria-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | Nigerian Folk Roots — *(standard slots)* | Mali anchor; jùjú/highlife in `07` |

#### Afro-Cuban & Diaspora Bridge — `regions-africa-diaspora-music-*`

| Slot | Title | Compared with |
|------|-------|---------------|
| 01–08 | African Diaspora Music Origins — *(standard slots)* | Mali `01`; Block H Caribbean; blues `07-styles/05` |

### Diaspora — `africa-diaspora` (5 lessons)

| # | ID suffix | Title | Compared with |
|---|-----------|-------|---------------|
| 1 | `01-blues-bridge` | Blues and West African Retentions | Mali `04`; Roots/Appalachia |
| 2 | `02-cuban-bridge` | Cuban Clave and African Rhythm | Block H Caribbean |
| 3 | `03-brazil-samba-bridge` | Samba and African Heritage | Block H Brazil |
| 4 | `04-colonial-archives` | Recording Colonialism and Archives | Mali `06`; Ireland `06` |
| 5 | `05-listening-across-borders` | Atlantic Rhythm Listening Lab | Celtic `05-listening` |

### Comparative — `africa-comparative` (4 lessons)

| # | ID suffix | Title | Cross-links |
|---|-----------|-------|-------------|
| 1 | `01-what-african-roots-means` | Roots, Diaspora, and Label Politics | Celtic `01` |
| 2 | `02-shared-instruments` | Harp, Lute, Percussion Compared | Celtic `02` (kora/harp) |
| 3 | `03-forms-compared` | Cyclic Rhythm vs Tune-Type Forms | Celtic `03` |
| 4 | `04-transmission-compared` | Griot Lineage vs Session | Celtic `04` |

---

## Cross-block index: recommended study order

| Order | Block | Anchor | Lessons (approx.) |
|-------|-------|--------|-------------------|
| 1 | A Celtic Music ✅ | Ireland | 41 |
| 2 | B British Isles Folk | England | 37 |
| 3 | C North American Roots | Appalachia | 41 |
| 4 | D French & Acadian | Quebec | 37 |
| 5 | E Nordic | Norway | 45 |
| 6 | F Iberian | Galicia | 37 |
| 7 | G Eastern Europe | Hungary | 37 |
| 8 | H Latin America | Mexico | 37 |
| 9 | I Middle East | Turkey | 37 |
| 10 | J East Asia | Japan | 37 |
| 11 | K South Asia | Hindustani | 37 |
| 12 | L West Africa | Mali | 37 |

**Per block:** (national units × 8) + 5 diaspora + 4 comparative.  
**National unit count varies:** 4–6 units per block in this sketch → **~37–49 lessons per block**.

**Grand total (all blocks, sketch):** ~470 national/diaspora/comparative lessons beyond theory spine.

---

## ID convention summary

```
regions-{block}-{nation}-{slot}
regions-{block}-diaspora-{01-05}
regions-{block}-comparative-{01-04}
```

Examples:

- `regions-roots-appalachia-04-genres-forms`
- `regions-nordic-norway-08-tunes`
- `regions-asia-hindustani-04-genres-forms` *(raga/tala content)*
- `regions-africa-mali-05-dance`

**Compared-with line** (authoring boilerplate):

```markdown
## Compared with [Anchor]

[Anchor nation] lesson `regions-{block}-{anchor}-{slot}` covers …; this lesson …

**Parallel anchor lesson:** `regions-{block}-{anchor}-{slot}`
**Secondary comparison:** `regions-celtic-ireland-{slot}` (where Atlantic-trad link applies)
```

---

## Next implementation steps

1. Add block stubs to `curriculum.json` (units only; no bulk generation).
2. Clone `scaffold_celtic_units.py` → `scaffold_regional_block.py` with block config.
3. Pilot **Block B (England)** or **Block C (Appalachia)** using Ireland hybrid pipeline.
4. Extend `export_feed_from_lessons.py` region discovery for new `public/lessons/{region}/` folders.

*Generated as planning inventory — not yet wired to curriculum manifest.*
