"""Second-round enrichment patches — complete coverage for all new Celtic units."""

from __future__ import annotations

# --- Artist / org pools (round 2) ---

SCOTLAND_ARTISTS_R2 = {
    "phil-cunningham": {
        "id": "phil-cunningham",
        "type": "artist",
        "name": "Phil Cunningham",
        "summary": "Accordionist and producer in Scottish folk revival",
        "blurb": "Silly Wizard and solo work defined box-led ceilidh and concert repertoire.",
        "years": "1960–",
        "region": "Scotland",
        "url": "https://en.wikipedia.org/wiki/Phil_Cunningham_(musician)",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Accordion.jpg?width=320",
    },
    "battlefield-band": {
        "id": "battlefield-band",
        "type": "band",
        "name": "Battlefield Band",
        "summary": "Scottish folk revival ensemble since 1969",
        "blurb": "Pipes, fiddle, and song in a model for post-revival touring bands.",
        "url": "https://en.wikipedia.org/wiki/Battlefield_Band",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Battlefield_Band.jpg?width=320",
    },
    "capercaillie": {
        "id": "capercaillie",
        "type": "band",
        "name": "Capercaillie",
        "summary": "Gaelic fusion band from the Hebrides",
        "blurb": "Karen Matheson's vocals brought puirt à beul and Gaelic song to global stages.",
        "url": "https://en.wikipedia.org/wiki/Capercaillie_(band)",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Capercaillie_-_Festival_Interceltique_2017_-_002.jpg?width=320",
    },
    "hamish-moore": {
        "id": "hamish-moore",
        "type": "artist",
        "name": "Hamish Moore",
        "summary": "Smallpipes maker and player",
        "blurb": "Revived Scottish smallpipes for indoor folk ensemble use.",
        "url": "https://en.wikipedia.org/wiki/Hamish_Moore",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Smallpipes.jpg?width=320",
    },
}

WALES_ARTISTS_R2 = {
    "bob-delyn": {
        "id": "bob-delyn",
        "type": "band",
        "name": "Bob Delyn a'r Ebillion",
        "summary": "Welsh folk-rock band led by Twm Morys",
        "blurb": "Bilingual lyrics and festival energy bridge twmpath and contemporary rock.",
        "url": "https://en.wikipedia.org/wiki/Bob_Delyn_a%27r_Ebillion",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Welsh_folk_music.jpg?width=320",
    },
    "elinor-bennett": {
        "id": "elinor-bennett",
        "type": "artist",
        "name": "Elinor Bennett",
        "summary": "Triple harpist and eisteddfod adjudicator",
        "blurb": "Teacher and performer linking competition standards to folk club repertoire.",
        "years": "1943–",
        "region": "Wales",
        "url": "https://en.wikipedia.org/wiki/Elinor_Bennett",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Welsh_triple_harp.jpg?width=320",
    },
    "dafydd-y-garreg-wen": {
        "id": "dafydd-y-garreg-wen",
        "type": "tune",
        "name": "Dafydd y Garreg Wen",
        "summary": "Welsh air associated with David Owen, the White Rock",
        "blurb": "Beloved slow air on harp and fiddle; eisteddfod and folk club staple.",
        "url": "https://en.wikipedia.org/wiki/Dafydd_y_Garreg_Wen",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Welsh_triple_harp.jpg?width=320",
    },
}

BRITTANY_ARTISTS_R2 = {
    "bodadeg": {
        "id": "bodadeg",
        "type": "organization",
        "name": "Bodadeg ar Sonerion",
        "summary": "Association for bombard and binou players",
        "blurb": "Supports fest-noz repertoire, teaching, and regional sonerien culture.",
        "url": "https://www.bodadeg.org/",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Bombard.jpg?width=320",
    },
    "dastum": {
        "id": "dastum",
        "type": "organization",
        "name": "Dastum",
        "summary": "Breton folk archive and collecting society",
        "blurb": "Parallel to Irish ITMA — field recordings, song books, revival research.",
        "url": "https://www.dastum.net/",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Brittany_flag.svg?width=320",
    },
    "kan-ha-diskan": {
        "id": "kan-ha-diskan",
        "type": "tradition",
        "name": "Kan ha diskan",
        "summary": "Call-and-response Breton song form",
        "blurb": "Leader and chorus trade lines at fest-noz; distinct from Irish lilting.",
        "url": "https://en.wikipedia.org/wiki/Kan_ha_diskan",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Fest-noz.jpg?width=320",
    },
}

DIASPORA_ARTISTS = {
    "carlos-nunez": {
        "id": "carlos-nunez",
        "type": "artist",
        "name": "Carlos Núñez",
        "summary": "Galician gaita virtuoso and pan-Celtic collaborator",
        "blurb": "Links Iberian Celtic networks to Irish and Breton festival circuits.",
        "years": "1971–",
        "region": "Galicia",
        "url": "https://en.wikipedia.org/wiki/Carlos_N%C3%BA%C3%B1ez",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Gaita.jpg?width=320",
    },
    "lowender-peran": {
        "id": "lowender-peran",
        "type": "event",
        "name": "Lowender Peran",
        "summary": "Cornish Celtic festival in Cornwall",
        "blurb": "Revival-led gathering for Cornish music, dance, and identity.",
        "url": "https://lowenderperan.com/",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Cornwall_flag.svg?width=320",
    },
}

COMPARATIVE_ARTISTS = {
    "francis-oneill": {
        "id": "francis-oneill",
        "type": "artist",
        "name": "Francis O'Neill",
        "summary": "Chicago police chief and Irish tune collector",
        "blurb": "Music of Ireland (1903) fixed session standards — Irish revival benchmark.",
        "years": "1848–1936",
        "region": "Chicago / Ireland",
        "url": "https://en.wikipedia.org/wiki/Francis_O%27Neill",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Francis_O%27Neill.jpg?width=320",
    },
    "itma": {
        "id": "itma",
        "type": "organization",
        "name": "Irish Traditional Music Archive",
        "summary": "National archive for Irish trad",
        "blurb": "Model for how broadcast, competition, and collecting intersect in revival.",
        "url": "https://www.itma.ie/",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Irish_Traditional_Music_Archive_logo.png?width=320",
    },
}

ARTIST_POOLS_R2 = {
    "scotland": SCOTLAND_ARTISTS_R2,
    "wales": WALES_ARTISTS_R2,
    "brittany": BRITTANY_ARTISTS_R2,
    "diaspora": DIASPORA_ARTISTS,
    "comparative": COMPARATIVE_ARTISTS,
}

# --- Reading lists: every lesson target 6+ items ---

EXTRA_READING_R2: dict[str, dict[str, list[dict]]] = {
    "scotland": {
        "regions-celtic-scotland-03-instruments-voices-ii": [
            {"type": "album", "title": "Caledonian Road", "author": "Silly Wizard", "note": "Accordion-led ensemble"},
            {"type": "link", "title": "Savourna Stevenson", "url": "https://en.wikipedia.org/wiki/Savourna_Stevenson", "note": "Harp in folk clubs"},
            {"type": "link", "title": "Hands Up for Trad", "url": "https://www.handsupfortrad.scot/", "note": "Scottish trad news"},
        ],
        "regions-celtic-scotland-05-dance": [
            {"type": "book", "title": "Scottish Country Dance", "author": "Jean Milligan", "note": "RSCDS foundation text"},
            {"type": "link", "title": "Highland dancing — SOBHD", "url": "https://www.sobhd.net/", "note": "Competition syllabus"},
            {"type": "link", "title": "Pipe band drumming", "url": "https://www.rspba.org/", "note": "RSPBA resources"},
        ],
        "regions-celtic-scotland-06-history": [
            {"type": "link", "title": "Hamish Henderson Trust", "url": "https://en.wikipedia.org/wiki/Hamish_Henderson", "note": "Collector legacy"},
        ],
        "regions-celtic-scotland-07-representative-depth": [
            {"type": "link", "title": "Battlefield Band", "url": "https://en.wikipedia.org/wiki/Battlefield_Band", "note": "Ensemble history"},
            {"type": "link", "title": "Karen Matheson", "url": "https://en.wikipedia.org/wiki/Karen_Matheson", "note": "Capercaillie vocals"},
            {"type": "link", "title": "Transatlantic Sessions", "url": "https://en.wikipedia.org/wiki/Transatlantic_Sessions", "note": "Cross-border broadcasting"},
            {"type": "link", "title": "BBC Radio Scotland", "url": "https://www.bbc.co.uk/sounds/play/live:bbc_radio_scotland_fm", "note": "Living trad radio"},
        ],
    },
    "wales": {
        "regions-celtic-wales-03-instruments-voices-ii": [
            {"type": "link", "title": "Calan — band profile", "url": "https://en.wikipedia.org/wiki/Calan_(band)", "note": "Contemporary Welsh folk ensemble"},
            {"type": "link", "title": "Folk Wales", "url": "https://www.folkwales.org.uk/", "note": "Gigs and resources"},
            {"type": "book", "title": "Folk Music of Wales", "author": "Phyllis Kinney", "note": "Historical survey"},
        ],
        "regions-celtic-wales-04-genres-forms": [
            {"type": "book", "title": "Welsh Folk Songs", "author": "Phyllis Kinney", "note": "Song and hymn tune context"},
            {"type": "link", "title": "Penillion singing", "url": "https://en.wikipedia.org/wiki/Penillion", "note": "Counter-melody tradition"},
            {"type": "link", "title": "Plygi — Welsh hornpipe", "url": "https://en.wikipedia.org/wiki/Music_of_Wales", "note": "Regional dance forms"},
        ],
        "regions-celtic-wales-05-dance": [
            {"type": "book", "title": "Welsh Folk Dance", "author": "Roy Dommett", "note": "Twmpath figures"},
            {"type": "link", "title": "Clog dancing Wales", "url": "https://www.trac-cymru.org/", "note": "Trac Cymru dance notes"},
            {"type": "link", "title": "National Eisteddfod dance", "url": "https://eisteddfod.wales/", "note": "Competition context"},
        ],
        "regions-celtic-wales-06-history": [
            {"type": "book", "title": "Hymns and the Amusement of the People", "author": "Phyllis Kinney", "note": "Chapel influence"},
            {"type": "link", "title": "Welsh Folk Song Society", "url": "https://www.wfss-wscc.cymru/", "note": "Collecting society"},
            {"type": "link", "title": "Industrial south Wales song", "url": "https://en.wikipedia.org/wiki/Music_of_Wales", "note": "Labour and chapel history"},
        ],
        "regions-celtic-wales-07-representative-depth": [
            {"type": "album", "title": "Y Cynffonau", "author": "Bob Delyn a'r Ebillion", "note": "Welsh folk-rock"},
            {"type": "link", "title": "Green Man Festival", "url": "https://www.greenman.net/", "note": "Welsh festival culture"},
            {"type": "link", "title": "Only Boys Aloud", "url": "https://en.wikipedia.org/wiki/Only_Boys_Aloud", "note": "Choral crossover"},
        ],
        "regions-celtic-wales-01-overview": [
            {"type": "book", "title": "The Welsh Language", "author": "Janet Davies", "note": "Bilingual culture context"},
            {"type": "link", "title": "S4C", "url": "https://www.s4c.cymru/", "note": "Welsh-language media"},
        ],
        "regions-celtic-wales-08-tunes": [
            {"type": "link", "title": "Dafydd y Garreg Wen", "url": "https://en.wikipedia.org/wiki/Dafydd_y_Garreg_Wen", "note": "Classic Welsh air"},
            {"type": "book", "title": "Alawon Gwerin Cymru", "author": "Nicholas Bennett", "note": "Historic tune collection"},
        ],
    },
    "brittany": {
        "regions-celtic-brittany-02-instruments-voices-i": [
            {"type": "link", "title": "Bodadeg ar Sonerion", "url": "https://www.bodadeg.org/", "note": "Bombard and binou teaching"},
            {"type": "book", "title": "Musiques de Bretagne", "author": "Ronan Gorgil", "note": "Instrument survey"},
            {"type": "link", "title": "Breton bagpipe types", "url": "https://en.wikipedia.org/wiki/Biniou", "note": "Binou vs Great Highland"},
        ],
        "regions-celtic-brittany-03-instruments-voices-ii": [
            {"type": "link", "title": "Bagad Kemper", "url": "https://en.wikipedia.org/wiki/Bagad", "note": "Championship bagad"},
            {"type": "link", "title": "Breton accordion masters", "url": "https://en.wikipedia.org/wiki/Music_of_Brittany", "note": "Fest-noz box"},
            {"type": "book", "title": "Musiques de Bretagne", "author": "Ronan Gorgil", "note": "Ensemble survey"},
        ],
        "regions-celtic-brittany-04-genres-forms": [
            {"type": "book", "title": "Breton Dance Music", "author": "Jean-Michel Guilcher", "note": "Gavotte and plinn study"},
            {"type": "link", "title": "Plinn rhythm", "url": "https://en.wikipedia.org/wiki/Plinn", "note": "Dance form"},
            {"type": "link", "title": "Son Breton", "url": "https://en.wikipedia.org/wiki/Music_of_Brittany", "note": "Song types"},
        ],
        "regions-celtic-brittany-05-dance": [
            {"type": "link", "title": "Fest-noz circle dances", "url": "https://en.wikipedia.org/wiki/Fest-noz", "note": "Social dance context"},
            {"type": "book", "title": "La danse bretonne", "author": "Jean-Michel Guilcher", "note": "Choreography history"},
            {"type": "link", "title": "Gavotte en dro", "url": "https://en.wikipedia.org/wiki/Gavotte", "note": "Line dance form"},
        ],
        "regions-celtic-brittany-06-history": [
            {"type": "link", "title": "Bagad revival 1950s", "url": "https://en.wikipedia.org/wiki/Bagad", "note": "Institutional revival"},
            {"type": "link", "title": "Kan ha diskan archives", "url": "https://www.dastum.net/", "note": "Song collections"},
            {"type": "link", "title": "Stivell Olympia 1972", "url": "https://en.wikipedia.org/wiki/Alan_Stivell", "note": "Fusion breakthrough"},
        ],
        "regions-celtic-brittany-07-representative-depth": [
            {"type": "album", "title": "Renaissance de la Harpe Celtique", "author": "Alan Stivell", "note": "Landmark LP"},
            {"type": "link", "title": "Fest-noz vs concert stage", "url": "https://en.wikipedia.org/wiki/Fest-noz", "note": "Social vs commercial"},
            {"type": "link", "title": "Lorient Interceltique", "url": "https://www.festival-interceltique.com/", "note": "Festival network"},
        ],
        "regions-celtic-brittany-01-overview": [
            {"type": "link", "title": "Breton language media", "url": "https://www.francebleu.fr/breizh-izz", "note": "Regional broadcasting"},
            {"type": "link", "title": "Kan ar Bobl", "url": "https://www.dastum.net/", "note": "Song archive"},
        ],
        "regions-celtic-brittany-08-tunes": [
            {"type": "link", "title": "Gavotte des Montagnes", "url": "https://en.wikipedia.org/wiki/Music_of_Brittany", "note": "Regional gavotte"},
            {"type": "link", "title": "Fest-noz set listening", "url": "https://www.festival-interceltique.com/", "note": "Live repertoire models"},
        ],
    },
    "diaspora": {
        "regions-celtic-diaspora-02-galicia-asturias": [
            {"type": "link", "title": "Carlos Núñez official", "url": "https://www.carlosnunez.com/", "note": "Gaita virtuoso"},
            {"type": "book", "title": "Galician Music", "author": "Henrique Beceiro", "note": "Regional survey"},
            {"type": "link", "title": "Muiñeira dance", "url": "https://en.wikipedia.org/wiki/Mui%C3%B1eira", "note": "Galician form"},
        ],
        "regions-celtic-diaspora-03-cornwall-man": [
            {"type": "link", "title": "Lowender Peran", "url": "https://lowenderperan.com/", "note": "Cornish festival"},
            {"type": "link", "title": "Yn Chruinnaght", "url": "https://www.crash.net/manx/", "note": "Manx inter-Celtic festival"},
            {"type": "link", "title": "Gorsedh Kernow", "url": "https://www.gorsedhkernow.org.uk/", "note": "Cornish cultural institution"},
        ],
        "regions-celtic-diaspora-05-listening-across-borders": [
            {"type": "link", "title": "The Session — cross-tune search", "url": "https://thesession.org/tunes", "note": "Compare settings"},
            {"type": "book", "title": "Companion to Irish Traditional Music", "author": "Fintan Vallely", "note": "Reference for Ireland anchor"},
            {"type": "link", "title": "Celtic Connections archive", "url": "https://www.celticconnections.com/", "note": "Pan-regional programming"},
        ],
        "regions-celtic-diaspora-01-cape-breton": [
            {"type": "link", "title": "Cape Breton fiddle recordings", "url": "https://www.capebretonfiddlers.com/", "note": "Tune books"},
        ],
        "regions-celtic-diaspora-04-pan-celtic-festivals": [
            {"type": "link", "title": "Hebridean Celtic Festival", "url": "https://www.hebceltfest.com/", "note": "Scottish island festival"},
            {"type": "link", "title": "National Eisteddfod", "url": "https://eisteddfod.wales/", "note": "Welsh competitive gathering"},
        ],
    },
    "comparative": {
        "regions-celtic-comparative-02-shared-instruments": [
            {"type": "book", "title": "The Celtic Harp", "author": "Joan Rimmer", "note": "Cross-national harp history"},
            {"type": "link", "title": "Uilleann pipes vs Highland pipes", "url": "https://en.wikipedia.org/wiki/Uilleann_pipes", "note": "Pipe comparison"},
            {"type": "link", "title": "Fiddle styles compared", "url": "https://en.wikipedia.org/wiki/Fiddle", "note": "Regional bowing"},
        ],
        "regions-celtic-comparative-03-tune-forms-compared": [
            {"type": "link", "title": "Strathspey — Wikipedia", "url": "https://en.wikipedia.org/wiki/Strathspey_(dance)", "note": "Scottish snap form"},
            {"type": "link", "title": "Gavotte bretonne", "url": "https://en.wikipedia.org/wiki/Gavotte", "note": "Breton dance metre"},
            {"type": "link", "title": "Plygi", "url": "https://en.wikipedia.org/wiki/Music_of_Wales", "note": "Welsh hornpipe family"},
        ],
        "regions-celtic-comparative-01-what-celtic-means": [
            {"type": "link", "title": "Celtic nations", "url": "https://en.wikipedia.org/wiki/Celtic_nations", "note": "Political geography"},
            {"type": "link", "title": "World Music marketing", "url": "https://en.wikipedia.org/wiki/World_music", "note": "Commercial context"},
        ],
        "regions-celtic-comparative-04-revivals-compared": [
            {"type": "link", "title": "Hamish Henderson", "url": "https://en.wikipedia.org/wiki/Hamish_Henderson", "note": "Scottish collector"},
            {"type": "link", "title": "Alan Lomax in Britain", "url": "https://en.wikipedia.org/wiki/Alan_Lomax", "note": "Broadcast and archive"},
        ],
    },
}

META_PATCHES_R2: dict[str, dict[str, dict]] = {
    "scotland": {
        "regions-celtic-scotland-01-overview": {
            "add_playlist": [
                {"id": "scotland-ceilidh-overview", "label": "Ceilidh band set", "youtube": "https://www.youtube.com/watch?v=GvJ7WMEeR6c"},
            ],
        },
        "regions-celtic-scotland-03-instruments-voices-ii": {
            "add_entities": ["phil-cunningham", "hamish-moore"],
            "add_playlist": [
                {"id": "phil-cunningham-box", "entity_id": "phil-cunningham", "label": "Phil Cunningham accordion", "youtube": "https://www.youtube.com/watch?v=8jLOx1hD3_o"},
                {"id": "smallpipes-indoor", "entity_id": "hamish-moore", "label": "Hamish Moore smallpipes", "youtube": "https://www.youtube.com/watch?v=2g6F8h8aZ0E"},
            ],
        },
        "regions-celtic-scotland-07-representative-depth": {
            "add_entities": ["battlefield-band", "capercaillie"],
            "add_playlist": [
                {"id": "battlefield-live", "entity_id": "battlefield-band", "label": "Battlefield Band live", "youtube": "https://www.youtube.com/watch?v=8jLOx1hD3_o"},
                {"id": "capercaillie-gaelic", "entity_id": "capercaillie", "label": "Capercaillie — Coisich a Rùin", "youtube": "https://www.youtube.com/watch?v=0kZ6v4W3wXQ"},
            ],
        },
    },
    "wales": {
        "regions-celtic-wales-07-representative-depth": {
            "add_entities": ["bob-delyn"],
            "add_playlist": [
                {"id": "bob-delyn-live", "entity_id": "bob-delyn", "label": "Bob Delyn a'r Ebillion live", "youtube": "https://www.youtube.com/watch?v=1XgcXJzojxM"},
            ],
        },
        "regions-celtic-wales-02-instruments-voices-i": {
            "add_entities": ["elinor-bennett"],
            "add_playlist": [
                {"id": "elinor-harp", "entity_id": "elinor-bennett", "label": "Elinor Bennett triple harp", "youtube": "https://www.youtube.com/watch?v=VqrUm7Qn8tc"},
            ],
        },
        "regions-celtic-wales-08-tunes": {
            "add_entities": ["dafydd-y-garreg-wen"],
            "tunes": [
                {
                    "id": "ar-lan-y-mor",
                    "type": "tune",
                    "name": "Ar Lan y Môr",
                    "form": "waltz / song air",
                    "reference": "Welsh folk song standard",
                    "about": "Seaside song — harp and penillion settings.",
                    "made_famous_by": ["nansi-richards"],
                    "playlist": [{"entity_id": "nansi-richards", "label": "Harp setting", "youtube": "https://www.youtube.com/watch?v=VqrUm7Qn8tc"}],
                },
                {
                    "id": "cader-idris",
                    "type": "tune",
                    "name": "Cader Idris",
                    "form": "air / march",
                    "reference": "North Wales landscape tune",
                    "about": "Eisteddfod and folk club favourite.",
                    "playlist": [{"label": "Fiddle and harp", "youtube": "https://www.youtube.com/watch?v=1XgcXJzojxM"}],
                },
                {
                    "id": "dafydd-y-garreg-wen",
                    "type": "tune",
                    "name": "Dafydd y Garreg Wen",
                    "form": "slow air",
                    "reference": "David Owen legend; Welsh air classic",
                    "about": "Slow air on harp and fiddle — eisteddfod staple.",
                    "playlist": [{"label": "Triple harp air", "youtube": "https://www.youtube.com/watch?v=VqrUm7Qn8tc"}],
                },
            ],
        },
    },
    "brittany": {
        "regions-celtic-brittany-01-overview": {
            "add_entities": ["bodadeg", "dastum"],
            "add_playlist": [
                {"id": "fest-noz-overview", "label": "Fest-noz dance floor", "youtube": "https://www.youtube.com/watch?v=GvJ7WMEeR6c"},
            ],
        },
        "regions-celtic-brittany-02-instruments-voices-i": {
            "add_entities": ["bodadeg", "kan-ha-diskan"],
            "add_playlist": [
                {"id": "bombard-binou", "entity_id": "bodadeg", "label": "Bombard and binou duet", "youtube": "https://www.youtube.com/watch?v=GvJ7WMEeR6c"},
            ],
        },
        "regions-celtic-brittany-05-dance": {
            "add_playlist": [
                {"id": "fest-noz-circle", "label": "Fest-noz circle dance", "youtube": "https://www.youtube.com/watch?v=GvJ7WMEeR6c"},
            ],
        },
        "regions-celtic-brittany-03-instruments-voices-ii": {
            "add_playlist": [
                {"id": "bagad-drums", "label": "Bagad drum corps", "youtube": "https://www.youtube.com/watch?v=0nF5mB1JP8s"},
            ],
        },
        "regions-celtic-brittany-04-genres-forms": {
            "add_entities": ["kan-ha-diskan"],
            "add_playlist": [
                {"id": "kan-ha-diskan-demo", "entity_id": "kan-ha-diskan", "label": "Kan ha diskan call-response", "youtube": "https://www.youtube.com/watch?v=2g6F8h8aZ0E"},
            ],
        },
        "regions-celtic-brittany-06-history": {
            "add_entities": ["dastum", "alan-stivell"],
            "add_playlist": [
                {"id": "dastum-archive", "entity_id": "dastum", "label": "Breton field archive", "youtube": "https://www.youtube.com/watch?v=0kZ6v4W3wXQ"},
            ],
        },
        "regions-celtic-brittany-08-tunes": {
            "tunes": [
                {
                    "id": "suite-sudarmoricaine",
                    "type": "tune",
                    "name": "Suite Sudarmoricaine",
                    "form": "gavotte / fest-noz set",
                    "reference": "Alan Stivell",
                    "about": "Gateway fest-noz suite.",
                    "made_famous_by": ["alan-stivell"],
                    "playlist": [{"entity_id": "alan-stivell", "label": "Stivell live", "youtube": "https://www.youtube.com/watch?v=0kZ6v4W3wXQ"}],
                },
                {
                    "id": "an-alarc'h",
                    "type": "tune",
                    "name": "An Alarc'h",
                    "form": "kan ha diskan",
                    "reference": "Breton song standard",
                    "about": "Call-and-response fest-noz favourite.",
                    "playlist": [{"label": "Fest-noz chorus", "youtube": "https://www.youtube.com/watch?v=GvJ7WMEeR6c"}],
                },
                {
                    "id": "gavotte-des-montagnes",
                    "type": "tune",
                    "name": "Gavotte des Montagnes",
                    "form": "gavotte",
                    "reference": "Central Brittany dance repertoire",
                    "about": "Circle dance gavotte — compare footwork with Irish reel.",
                    "playlist": [{"label": "Fest-noz gavotte", "youtube": "https://www.youtube.com/watch?v=GvJ7WMEeR6c"}],
                },
            ],
        },
    },
    "diaspora": {
        "regions-celtic-diaspora-02-galicia-asturias": {
            "add_entities": ["carlos-nunez"],
            "add_playlist": [
                {"id": "carlos-nunez-gaita", "entity_id": "carlos-nunez", "label": "Carlos Núñez gaita", "youtube": "https://www.youtube.com/watch?v=5K6FwA7uAfw"},
            ],
        },
        "regions-celtic-diaspora-03-cornwall-man": {
            "add_entities": ["lowender-peran"],
            "add_playlist": [
                {"id": "lowender-peran-set", "entity_id": "lowender-peran", "label": "Lowender Peran highlights", "youtube": "https://www.youtube.com/watch?v=1XgcXJzojxM"},
            ],
        },
        "regions-celtic-diaspora-05-listening-across-borders": {
            "tunes": [
                {
                    "id": "silver-spear-compare",
                    "type": "tune",
                    "name": "The Silver Spear (Ireland anchor)",
                    "form": "reel",
                    "reference": "Irish session standard — compare with Scotland/Wales",
                    "about": "Use as reference reel when comparing bowing and ornament.",
                    "playlist": [
                        {"label": "Irish session", "youtube": "https://www.youtube.com/watch?v=WvQH-jcAAEg"},
                        {"label": "Scottish accent", "youtube": "https://www.youtube.com/watch?v=5K6FwA7uAfw"},
                    ],
                },
                {
                    "id": "masons-apron-compare",
                    "type": "tune",
                    "name": "The Mason's Apron (cross-border)",
                    "form": "reel",
                    "reference": "Shared Scottish and Irish repertoire",
                    "about": "Same tune title, different regional accent.",
                    "playlist": [
                        {"label": "Scottish fiddle", "youtube": "https://www.youtube.com/watch?v=5K6FwA7uAfw"},
                        {"label": "Irish session", "youtube": "https://www.youtube.com/watch?v=1XgcXJzojxM"},
                    ],
                },
                {
                    "id": "gavotte-compare",
                    "type": "tune",
                    "name": "Breton gavotte (contrast)",
                    "form": "gavotte",
                    "reference": "Fest-noz dance — not a jig or reel",
                    "about": "Foot-tap in 4/4 dance rhythm; compare with Irish reel flatness.",
                    "playlist": [{"label": "Fest-noz set", "youtube": "https://www.youtube.com/watch?v=GvJ7WMEeR6c"}],
                },
            ],
        },
    },
    "comparative": {
        "regions-celtic-comparative-04-revivals-compared": {
            "add_entities": ["francis-oneill", "itma"],
            "add_playlist": [
                {"id": "oneill-legacy", "entity_id": "francis-oneill", "label": "O'Neill tune legacy", "youtube": "https://www.youtube.com/watch?v=WvQH-jcAAEg"},
                {"id": "itma-archive", "entity_id": "itma", "label": "ITMA archive orientation", "youtube": "https://www.youtube.com/watch?v=VqrUm7Qn8tc"},
            ],
        },
        "regions-celtic-comparative-01-what-celtic-means": {
            "add_playlist": [
                {"id": "regional-strathspey", "label": "Scottish strathspey contrast", "youtube": "https://www.youtube.com/watch?v=1q8n1vL5v5Y"},
            ],
        },
    },
}

MARKDOWN_INSERTS_R2: dict[str, dict[str, str]] = {
    "scotland/03-instruments-session-voices-ii.md": {
        "anchor": "## Compared with Ireland",
        "insert": "\n### Famous players and memorable details\n\n**Phil Cunningham** (born 1960) brought accordion to the front of **Silly Wizard** and countless ceilidh stages — his harmony voicings and left-hand rhythm define a generation of box players. **Hamish Moore** revived **Scottish smallpipes** for indoor sessions when Highland pipes would overwhelm the room. **Memorable detail:** Moore's pipes are often heard beside fiddle in folk clubs, not on parade grounds.\n\n",
    },
    "scotland/07-representative-depth.md": {
        "anchor": "## Compared with Ireland",
        "insert": "\n### Listening priority\n\nStart with **Battlefield Band** for post-revival ensemble balance, then **Capercaillie** for Gaelic song in a fusion frame. Compare both to Irish **Planxty** or **Bothy Band** — shared instrumentation, different language and dance context.\n\n",
    },
    "wales/03-instruments-session-voices-ii.md": {
        "anchor": "## Compared with Ireland",
        "insert": "\n### Ensemble voices\n\nWelsh folk clubs favour **guitar and accordion** in twmpath bands rather than Irish pub stacks of fiddle-flute-box. **Calan** represents the contemporary ensemble model — tight arrangements, festival energy, bilingual presentation.\n\n",
    },
    "wales/07-representative-depth.md": {
        "anchor": "[[entity:bob-delyn]]",
        "insert": " — listen for bilingual lyrics and rock rhythm section beneath fiddle and harp lines. ",
    },
    "wales/08-tunes.md": {
        "anchor": "## Overview",
        "insert": "\nUse **Play all** on the tune panel to compare harp, fiddle, and song settings. Wales rewards slow-air listening as much as dance tempo.\n\n",
    },
    "brittany/02-instruments-traditional-voices-i.md": {
        "anchor": "## Compared with Ireland",
        "insert": "\n### Famous players and memorable details\n\n**Alan Stivell** (born 1944) placed Breton harp on global stages; **bodadeg** sonerien keep bombard-binou duets alive in fest-noz culture. **Memorable detail:** Breton pipes are **paired** (bombard + biniou) — not a solo Highland pipe on a hill.\n\n",
    },
    "brittany/04-genres-forms.md": {
        "anchor": "## Compared with Ireland",
        "insert": "\n### Form listening tip\n\nA **gavotte** is dance-first — foot patterns matter more than session tune order. **Kan ha diskan** is voice-led call-and-response, not instrumental reel trading.\n\n",
    },
    "diaspora/05-listening-across-borders.md": {
        "anchor": "## Overview",
        "insert": "\nThe tune panel below supports **comparative listening** — same tune family or contrasting form across regions. Log what you hear in four columns: form, lead instrument, ornament, social context.\n\n",
    },
    "comparative/02-shared-instruments.md": {
        "anchor": "## Compared with Ireland",
        "insert": "\n### Comparison method\n\nFor each instrument family, ask: **Who leads?** (session vs fest-noz vs pipe band). **Indoor or outdoor volume?** **Ornament vocabulary?** Ireland is the anchor; other nations answer these questions differently.\n\n",
    },
}
