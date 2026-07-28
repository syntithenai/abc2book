#!/usr/bin/env python3
"""Regional tradition block definitions (Blocks B–L)."""

from __future__ import annotations

from regional_lesson_builder import BlockSpec, NationSpec


def n(
    key: str,
    title: str,
    wiki: str,
    i1: str,
    i2: str,
    forms: str,
    dance: str,
    history: str,
    fusion: str,
    tunes: str,
    entities: list[str] | None = None,
    note: str = "",
) -> NationSpec:
    return NationSpec(
        key=key,
        region=key,
        unit=key,
        title_prefix=title,
        wiki=wiki,
        instruments_i=i1,
        instruments_ii=i2,
        forms=forms,
        dance=dance,
        history=history,
        fusion=fusion,
        tunes=tunes,
        compare_note=note,
        entity_names=entities or [],
    )


def _std_diaspora(block_label: str, anchor: str) -> list[tuple[str, str, str]]:
    return [
        ("01-diaspora-communities", "Diaspora Communities", f"{block_label} diaspora communities carry {anchor} roots into new cities and festivals."),
        ("02-radio-archives", "Radio and Archives Abroad", f"Broadcasting and field archives shaped how {anchor} repertoire spread internationally."),
        ("03-festival-networks", "Festival Networks", f"Festivals link {anchor} musicians with global folk networks and teaching camps."),
        ("04-fusion-scenes", "Fusion and Urban Scenes", f"Urban fusion scenes remix {anchor} instruments with pop, jazz, or world-music staging."),
        ("05-listening-across-borders", "Listening Across Borders", f"Comparative listening lab for {block_label}: anchor versus diaspora accent."),
    ]


def _std_comparative(block_label: str, anchor: str) -> list[tuple[str, str, str]]:
    return [
        ("01-what-the-tradition-means", f'What "{block_label}" Means', f'Marketing labels flatten {anchor} and sibling nations — trad is regional, not one sound.'),
        ("02-shared-instruments", "Shared Instruments Compared", f"Fiddle, voice, pipes, and percussion appear across {block_label} with different roles."),
        ("03-forms-compared", "Forms and Metre Compared", f"Dance forms and metres in {block_label} share family resemblance with distinct foot-tap feel."),
        ("04-revivals-compared", "Revivals and Archives Compared", f"Collectors, radio, competitions, and archives revived {block_label} on different timelines."),
    ]


BLOCKS: list[BlockSpec] = []

BLOCKS.append(
    BlockSpec(
        block_id="british-folk", folder="british-folk", id_prefix="british",
        track_label="British Isles Folk", anchor_key="england", compare_label="England",
        compare_id_prefix="regions-british-england",
        nations=[
            n("england", "English Traditional Music", "Music of England",
              "fiddle, concertina, melodeon, and unaccompanied voice",
              "guitar, piano, pipe and tabor, morris band",
              "hornpipes, jigs, ballads, shanties", "morris, country dance, ceilidh overlap",
              "Cecil Sharp, Vaughan Williams, EFDSS", "folk-rock, clubs, Cropredy",
              "Spancil Hill, Brighton Camp, Rufty Tufty", ["Martin Carthy", "Fairport Convention", "EFDSS"]),
            n("northumbria", "Northumbrian Traditional Music", "Music of Northumbria",
              "Northumbrian smallpipes, fiddle, border ballad voice", "guitar, piano, session backing",
              "hornpipes, rants, jigs", "rapper sword, social dance",
              "Northumbrian Minstrelsy, collectors", "Folkworks, festivals",
              "Bonny at Morn, Peacock Follow the Hen", ["Billy Pigg", "Kathryn Tickell"], "smallpipes indoor volume vs Irish uilleann"),
            n("song", "English Song Tradition", "English folk music",
              "unaccompanied voice, concertina, guitar", "piano, harmony singers",
              "ballad, broadside, shanty, carol", "social song, club performance",
              "Child ballads, broadsides, Topic Records", "folk clubs, radio ballads",
              "Barbara Allen, The Cruel Ship's Carpenter", ["A. L. Lloyd", "Nic Jones"], "ballad narrative vs Irish sean-nós"),
            n("morris", "Morris and Country Dance", "Morris dance",
              "melodeon, pipe and tabor, fiddle", "morris side band, concertina",
              "jigs, polkas, processional tunes", "Cotswold, Border, Northwest morris",
              "Sharp revival, Morris Ring", "display sides, May Day",
              "Banbury Bill, Lads-a-Bunchum", ["Bampton Morris", "Oak"], "morris side vs Irish session"),
        ],
        diaspora=_std_diaspora("British Isles Folk", "English trad"),
        comparative=_std_comparative("British Isles Folk", "England"),
    )
)

BLOCKS.append(
    BlockSpec(
        block_id="roots", folder="north-american-roots", id_prefix="roots",
        track_label="North American Roots", anchor_key="appalachia", compare_label="Appalachia",
        compare_id_prefix="regions-roots-appalachia",
        nations=[
            n("appalachia", "Appalachian Old-Time Music", "Music of Appalachia",
              "fiddle, banjo, voice", "guitar, bass, clogging rhythm",
              "breakdowns, reels, ballads", "square dance, clog, flatfoot",
              "Lomax, 78rpm, courthouse squares", "bluegrass birth, fiddlers' conventions",
              "Soldier's Joy, Cripple Creek, Shady Grove", ["Tommy Jarrell", "Roscoe Holcomb", "Alan Lomax"]),
            n("bluegrass", "Bluegrass Music", "Bluegrass music",
              "fiddle, mandolin, banjo", "guitar, bass, dobro",
              "breakdown, gospel, song", "stage and dance floor",
              "Bill Monroe, festival circuit", "IBMA, jam culture",
              "Foggy Mountain Breakdown, Raw Hide", ["Bill Monroe", "Earl Scruggs"]),
            n("quebec", "Quebecois Traditional Music", "Music of Quebec",
              "fiddle, foot percussion", "piano, guitar, accordion",
              "reels, jigs, quadrilles", "quadrille, podorythmie",
              "Jean Carignan, archives", "festivals, crooked tunes",
              "Reel de Saint-Antoine, Grande Gigue Simple", ["Jean Carignan", "La Bottine Souriante"]),
            n("cajun", "Cajun & Creole Music", "Cajun music",
              "fiddle, accordion, voice", "guitar, triangle, drums",
              "two-step, waltz, blues overlap", "fais do-do, dance hall",
              "Acadian exile, revival", "zydeco border, Festivals Acadiens",
              "Jolie Blonde, Allons à Lafayette", ["Dennis McGee", "Clifton Chenier"]),
            n("contra", "New England Contra Dance Music", "Contra dance",
              "fiddle, piano", "guitar, band",
              "reels, quadrilles, composed tunes", "contra, square, caller-led",
              "Dudley Laufman, camp culture", "fusion bands, NEFFA",
              "Girl with the Blue Dress On", ["Rodney Miller", "Dudley Laufman"]),
        ],
        diaspora=_std_diaspora("North American Roots", "Appalachian old-time"),
        comparative=_std_comparative("North American Roots", "Appalachia"),
    )
)

BLOCKS.append(
    BlockSpec(
        block_id="french-acadian", folder="french-acadian", id_prefix="french",
        track_label="French & Acadian Folk", anchor_key="quebec", compare_label="Quebec",
        compare_id_prefix="regions-french-quebec",
        nations=[
            n("quebec", "Quebecois Traditional Music", "Music of Quebec",
              "fiddle, voice", "piano, guitar, accordion",
              "reels, jigs, quadrilles", "quadrille, podorythmie",
              "Carignan, archives", "festivals, crooked tunes",
              "Reel de Saint-Antoine, Grande Gigue Simple", ["Jean Carignan", "La Bottine Souriante"]),
            n("acadian", "Acadian Traditional Music", "Acadian music",
              "fiddle, voice", "guitar, piano",
              "reels, waltzes", "kitchen party, community dance",
              "Grand Dérangement, revival", "Maritime festivals",
              "Acadian regional repertoire", ["Joseph Allard"]),
            n("louisiana-cajun", "Louisiana Cajun Music", "Cajun music",
              "accordion, fiddle", "guitar, triangle",
              "two-step, waltz", "dance hall",
              "Louisiana French communities", "Festivals Acadiens",
              "Jolie Blonde", ["Dennis McGee"]),
            n("occitan", "Occitan Folk Music", "Music of Occitania",
              "bodega, voice, flute", "accordion, guitar",
              "ball, couplet", "farandole, bal",
              "southern France revival", "festivals",
              "Occitan dance airs", ["Occitan folk ensembles"]),
            n("basque", "Basque Traditional Music", "Music of the Basques",
              "txistu, voice, accordion", "tamboril, guitar",
              "aurreskar, marches", "social dance",
              "Basque cultural revival", "festivals",
              "Basque regional tunes", ["Kepa Junkera"]),
        ],
        diaspora=_std_diaspora("French & Acadian", "Quebecois trad"),
        comparative=_std_comparative("French & Acadian", "Quebec"),
    )
)

BLOCKS.append(
    BlockSpec(
        block_id="nordic", folder="nordic", id_prefix="nordic",
        track_label="Nordic Folk", anchor_key="norway", compare_label="Norway",
        compare_id_prefix="regions-nordic-norway",
        nations=[
            n("norway", "Norwegian Folk Music", "Music of Norway",
              "Hardanger fiddle, langeleik, voice", "accordion, guitar",
              "slått, pols, halling", "halling, springar",
              "collectors, GRAPA", "concerts, festivals",
              "Fanitullen, Springar forms", ["Annbjørg Lien", "Knut Buen"]),
            n("sweden", "Swedish Folk Music", "Music of Sweden",
              "nyckelharpa, fiddle", "accordion, guitar",
              "polska, schottis, waltz", "polska, hambo",
              "spelmansstämma", "Falun, fusion",
              "Swedish polska repertoire", ["Ale Möller", "Väsen"]),
            n("denmark", "Danish Folk Music", "Music of Denmark",
              "fiddle, accordion", "guitar, bass",
              "reels, pols, waltzes", "folk dance",
              "Danish collectors", "Tønder Festival",
              "Danish regional tunes", ["Harboe Brothers"]),
            n("finland", "Finnish Folk Music", "Music of Finland",
              "kantele, fiddle", "accordion, bass",
              "runo song, pelimanni tunes", "folk dance",
              "Karelia, archives", "Kaustinen Festival",
              "Finnish pelimanni repertoire", ["Maria Kalaniemi"]),
            n("islands", "Iceland & Faroe Traditions", "Music of Iceland",
              "fiddle, voice, langspil", "guitar, ensemble",
              "rimur, chain dance", "chain dance, vikivaki",
              "island isolation, revival", "folk festivals",
              "Icelandic rimur", ["Brynhildur Þórarinsdóttir"]),
            n("sami", "Sámi Music", "Sámi music",
              "joik, fiddle", "contemporary ensemble",
              "joik types", "ritual and festival",
              "rights movement, revival", "Riddu Riđđu",
              "joik listening studies", ["Mari Boine", "Wimme"]),
        ],
        diaspora=_std_diaspora("Nordic Folk", "Norwegian slått"),
        comparative=_std_comparative("Nordic Folk", "Norway"),
    )
)

BLOCKS.append(
    BlockSpec(
        block_id="iberian", folder="iberian", id_prefix="iberian",
        track_label="Iberian Folk", anchor_key="galicia", compare_label="Galicia",
        compare_id_prefix="regions-iberian-galicia",
        nations=[
            n("galicia", "Galician Traditional Music", "Music of Galicia",
              "gaita, fiddle, voice", "percussion, guitar",
              "muiñeira, alborada", "parade and dance",
              "Celtic networks, revival", "festivals",
              "Muiñeira de Chantada", ["Carlos Núñez"]),
            n("asturias", "Asturian Traditional Music", "Music of Asturias",
              "gaita, fiddle", "percussion, band",
              "asturian dance tunes", "regional dance",
              "Asturian revival", "festivals",
              "Asturian repertoire", ["Hevia"]),
            n("portugal", "Portuguese Folk Music", "Music of Portugal",
              "guitarra, voice, bagpipe", "accordion, percussion",
              "vira, chula, fado folk roots", "circle dance",
              "rural tradition, revival", "fado crossover in scenes lesson",
              "Vira regional forms", ["Amália Rodrigues"]),
            n("flamenco", "Flamenco", "Flamenco",
              "cante, guitar", "palmas, percussion",
              "palos, compás", "zapateado, braceo",
              "cafés cantantes, revival", "tablaos, festivals",
              "Soleá, Bulerías listening", ["Paco de Lucía", "Camarón"]),
            n("castile-catalan", "Castile & Catalan Folk", "Music of Catalonia",
              "gralla, fiddle, voice", "guitar, cobla",
              "sardana, jota", "community dance",
              "regional revival", "festivals",
              "Catalan sardana", ["Els Berros de la Cort"]),
        ],
        diaspora=_std_diaspora("Iberian Folk", "Galician gaita"),
        comparative=_std_comparative("Iberian Folk", "Galicia"),
    )
)

BLOCKS.append(
    BlockSpec(
        block_id="eastern-europe", folder="eastern-europe", id_prefix="east",
        track_label="Eastern European Folk", anchor_key="hungary", compare_label="Hungary",
        compare_id_prefix="regions-east-hungary",
        nations=[
            n("hungary", "Hungarian Folk Music", "Music of Hungary",
              "violin, voice, shepherd flute", "cimbalom, bass",
              "csárdás, verbunkos, asymmetric metre", "couple dance, village circle",
              "Bartók, Kodály collecting", "táncház, folk-rock",
              "Csárdás standard forms", ["Muzsikás", "Béla Bartók"]),
            n("balkans", "Balkan Folk Music", "Balkan folk music",
              "gaida, gadulka, voice", "tambura, accordion",
              "horo, odd metres", "line and circle dance",
              "village tradition, revival", "festivals, brass bands",
              "Balkan horo repertoire", ["Goran Bregović"]),
            n("klezmer", "Klezmer Music", "Klezmer",
              "clarinet, violin, voice", "accordion, bass, tsimbl",
              "freylekhs, dobriden", "wedding dance",
              "Ashkenazi diaspora, revival", "Klezmer festivals",
              "Freylekhs forms", ["Dave Tarras", "Itzhak Perlman klezmer"]),
            n("poland", "Polish Folk Music", "Music of Poland",
              "violin, voice", "accordion, bass",
              "mazurka, oberek, polska", "social dance",
              "regional collectors", "festivals",
              "Polish regional tunes", ["Warsaw Village Band"]),
            n("baltic", "Baltic Folk Music", "Music of the Baltic states",
              "fiddle, kokle, voice", "accordion, ensemble",
              "dance tunes, song", "regional dance",
              "Singing Revolution context", "festivals",
              "Baltic repertoire", ["Trad.Attack!"]),
        ],
        diaspora=_std_diaspora("Eastern European Folk", "Hungarian village music"),
        comparative=_std_comparative("Eastern European Folk", "Hungary"),
    )
)

BLOCKS.append(
    BlockSpec(
        block_id="latin-america", folder="latin-america", id_prefix="latin",
        track_label="Latin American Folk", anchor_key="mexico", compare_label="Mexico",
        compare_id_prefix="regions-latin-mexico",
        nations=[
            n("mexico", "Mexican Folk Music", "Music of Mexico",
              "violin, voice, harp", "guitar, vihuela, percussion",
              "son, huapango, corrido", "zapateado, social dance",
              "regional archives", "mariachi vs village son",
              "La Bamba, Cielito Lindo", ["Vicente Fernández", "Los Folkloristas"]),
            n("andes", "Andean Folk Music", "Music of the Andes",
              "quena, charango, voice", "bombo, guitar",
              "huayno, sikuri", "community festival",
              "indigenous revival", "nueva canción overlap",
              "El Condor Pasa", ["Inti-Illimani"]),
            n("brazil", "Brazilian Folk Roots", "Music of Brazil",
              "viola, voice, flute", "percussion, guitar",
              "choro, forró, samba roots", "dance",
              "regional traditions", "forró festivals",
              "Choro repertoire", ["Pixinguinha"]),
            n("caribbean", "Caribbean Folk Music", "Music of the Caribbean",
              "voice, percussion", "guitar, ensemble",
              "son, calypso roots", "carnival and social dance",
              "colonial history", "festivals",
              "Caribbean regional forms", ["Buena Vista Social Club"]),
            n("southern-cone", "Southern Cone Folk", "Music of Argentina",
              "guitar, bandoneon, voice", "bass, percussion",
              "chacarera, zamba, tango folk roots", "dance",
              "gaucho tradition", "festivals",
              "Zamba forms", ["Atahualpa Yupanqui"]),
        ],
        diaspora=_std_diaspora("Latin American Folk", "Mexican son"),
        comparative=_std_comparative("Latin American Folk", "Mexico"),
    )
)

BLOCKS.append(
    BlockSpec(
        block_id="middle-east", folder="middle-east", id_prefix="me",
        track_label="Middle Eastern & Mediterranean Folk", anchor_key="turkey", compare_label="Turkey",
        compare_id_prefix="regions-me-turkey",
        nations=[
            n("turkey", "Turkish Folk Music", "Music of Turkey",
              "bağlama, kemençe, voice", "davul, zurna, ensemble",
              "türkü, halay, makam-influenced song", "halay, horon",
              "TRT archives, collectors", "fusion, festivals",
              "Türkü listening studies", ["Aşık Veysel", "Erkan Oğur"]),
            n("levant", "Levantine Folk Music", "Music of the Levant",
              "oud, voice, mijwiz", "percussion, ensemble",
              "dabke, song forms", "line dance",
              "Levantine archives", "festivals",
              "Levantine repertoire", ["Marcel Khalife"]),
            n("maghreb", "Maghreb Folk Music", "Music of Morocco",
              "oud, voice, gnawa instruments", "percussion",
              "Andalusian legacy, gnawa", "social and trance dance",
              "colonial and revival history", "festivals",
              "Gnawa listening", ["Nass El Ghiwane"]),
            n("greece", "Greek Folk Music", "Music of Greece",
              "lyra, clarinet, voice", "lute, percussion",
              "syrtos, rebetiko roots", "circle dance",
              "rebetiko history", "festivals",
              "Syrtos forms", ["Markos Vamvakaris"]),
            n("persia", "Persian Music", "Music of Iran",
              "tar, setar, voice", "tombak, ensemble",
              "radif, regional song", "dance contexts",
              "classical-folk continuum", "festivals",
              "Dastgah listening intro", ["Mohammad Reza Shajarian"]),
        ],
        diaspora=_std_diaspora("Middle Eastern Folk", "Turkish türkü"),
        comparative=_std_comparative("Middle Eastern Folk", "Turkey"),
    )
)

BLOCKS.append(
    BlockSpec(
        block_id="east-asia", folder="east-asia", id_prefix="asia",
        track_label="East Asian Traditions", anchor_key="japan", compare_label="Japan",
        compare_id_prefix="regions-asia-japan",
        nations=[
            n("japan", "Japanese Traditional Music", "Music of Japan",
              "shakuhachi, shamisen, voice", "koto, percussion",
              "honkyoku, min'yō", "noh, bon odori",
              "iemoto lineage, folk revivals", "min'yō festivals",
              "Sakura, regional min'yō", ["Kodo", "Shakuhachi masters"]),
            n("china", "Chinese Folk Traditions", "Music of China",
              "erhu, dizi, voice", "pipa, ensemble",
              "regional opera, folk song", "lion dance, folk dance",
              "regional traditions", "conservatory and folk revival",
              "Jasmine Flower, regional tunes", ["Abing"]),
            n("korea", "Korean Folk Music", "Music of Korea",
              "gayageum, piri, voice", "janggu, ensemble",
              "pansori, minyo", "folk dance",
              "court-folk continuum", "festivals",
              "Arirang", ["pansori masters"]),
            n("mongolia", "Mongolian & Steppe Traditions", "Music of Mongolia",
              "morin khuur, voice", "ensemble",
              "long song, throat singing", "dance",
              "nomadic tradition", "festivals",
              "Mongolian long song", ["Huun-Huur-Tu"]),
            n("mainland-se", "Mainland Southeast Asian Folk", "Music of Thailand",
              "piphat instruments, voice", "percussion ensemble",
              "regional song", "social dance",
              "temple and village context", "heritage festivals",
              "Regional listening", ["traditional ensembles"]),
        ],
        diaspora=_std_diaspora("East Asian Traditions", "Japanese min'yō"),
        comparative=_std_comparative("East Asian Traditions", "Japan"),
    )
)

BLOCKS.append(
    BlockSpec(
        block_id="south-asia", folder="south-asia", id_prefix="south",
        track_label="South Asian Traditions", anchor_key="hindustani",
        compare_label="Hindustani tradition", compare_id_prefix="regions-south-hindustani",
        nations=[
            n("hindustani", "Hindustani Music", "Hindustani classical music",
              "sitar, sarod, voice", "tabla, tanpura, harmonium",
              "raga, tala, bandish", "kathak dance link",
              "gharana, All India Radio", "fusion festivals",
              "Yaman, Bhairavi listening", ["Ravi Shankar", "Zakir Hussain"]),
            n("carnatic", "Carnatic Music", "Carnatic music",
              "veena, violin, voice", "mridangam, ensemble",
              "raga, tala, kriti", "Bharatanatyam link",
              "lineage transmission", "Cleveland aradhana",
              "Kriti repertoire", ["M. S. Subbulakshmi"]),
            n("india-folk", "Indian Regional Folk", "Folk music of India",
              "ektara, dhol, voice", "harmonium, ensemble",
              "bhajan, baul, regional song", "folk dance",
              "village tradition", "festivals",
              "Baul song", ["Purna Das Baul"]),
            n("northwest", "Pakistan & Afghanistan Folk", "Music of Pakistan",
              "rubab, sitar, voice", "tabla, ensemble",
              "ghazal, regional folk", "social dance",
              "cross-border repertoire", "festivals",
              "Regional listening", ["Nusrat Fateh Ali Khan"]),
            n("bengal", "Bengali Folk", "Music of Bengal",
              "ektara, dotara, voice", "harmonium, percussion",
              "baul, bhatiali", "folk dance",
              "poetry-song tradition", "festivals",
              "Bhatiali forms", ["Lalan Fakir"]),
        ],
        diaspora=_std_diaspora("South Asian Traditions", "Hindustani raga"),
        comparative=_std_comparative("South Asian Traditions", "Hindustani"),
    )
)

BLOCKS.append(
    BlockSpec(
        block_id="west-africa", folder="west-africa", id_prefix="africa",
        track_label="West African Roots", anchor_key="mali", compare_label="Mali",
        compare_id_prefix="regions-africa-mali",
        nations=[
            n("mali", "Mande Music", "Music of Mali",
              "kora, ngoni, voice", "balafon, percussion",
              "jaliya, song forms", "ceremony and dance",
              "griot lineage, empire history", "Afropop, festivals",
              "Kaira, Mande repertoire", ["Toumani Diabaté", "Ali Farka Touré"]),
            n("guinea", "Guinea & Senegambia", "Music of Guinea",
              "kora, balafon, voice", "djembe ensemble",
              "Mande forms", "dance",
              "djembe tradition", "festivals",
              "Guinea percussion repertoire", ["Mory Kanté"]),
            n("ghana", "Ghanaian Traditions", "Music of Ghana",
              "kora overlap, voice, percussion", "ensemble",
              "highlife roots, folk song", "social dance",
              "colonial and post-colonial media", "highlife scenes",
              "Highlife listening", ["E.T. Mensah"]),
            n("nigeria", "Nigerian Folk Roots", "Music of Nigeria",
              "talking drum, voice", "ensemble",
              "jùjú roots, folk song", "dance",
              "urban and village transmission", "Afrobeats roots context",
              "Jùjú forms", ["Fela Kuti"]),
            n("diaspora-music", "African Diaspora Music Origins", "Music of the African diaspora",
              "voice, percussion", "guitar, ensemble",
              "blues, clave roots", "dance",
              "Atlantic slavery, recording era", "Cuban and American bridges",
              "Work song, blues form", ["Lead Belly", "African diaspora"]),
        ],
        diaspora=[
            ("01-blues-bridge", "Blues and West African Retentions", "Blues rhythm and scale retain West African heritage alongside American contexts."),
            ("02-cuban-bridge", "Cuban Clave and African Rhythm", "Cuban clave connects Caribbean dance music to African percussion concepts."),
            ("03-brazil-samba-bridge", "Samba and African Heritage", "Samba and related forms carry African rhythmic heritage in Brazil."),
            ("04-colonial-archives", "Recording Colonialism and Archives", "Colonial-era recording shaped what archives preserved and what was lost."),
            ("05-listening-across-borders", "Atlantic Rhythm Listening Lab", "Compare Mali anchor recordings with diaspora blues, clave, and samba."),
        ],
        comparative=_std_comparative("West African Roots", "Mali"),
    )
)


def apply_region_prefix(block: BlockSpec) -> None:
    for nation in block.nations:
        nation.region = f"{block.id_prefix}-{nation.key}"
        nation.unit = f"{block.id_prefix}-{nation.key}"


for block in BLOCKS:
    apply_region_prefix(block)
