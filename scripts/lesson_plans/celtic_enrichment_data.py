"""Incremental enrichment patches for Celtic units (Scotland, Wales, Brittany, Diaspora, Comparative)."""

from __future__ import annotations

# Shared artist / org entities reused across lessons
SCOTLAND_ARTISTS = {
    "james-scott-skinner": {
        "id": "james-scott-skinner",
        "type": "artist",
        "name": "James Scott Skinner",
        "summary": "Aberdeenshire fiddler and composer, the Strathspey King",
        "blurb": "Victorian showman whose strathspeys and recordings fixed competition repertoire for generations.",
        "years": "1843–1927",
        "region": "North East Scotland",
        "url": "https://en.wikipedia.org/wiki/James_Scott_Skinner",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/James_Scott_Skinner.jpg?width=320",
    },
    "aly-bain": {
        "id": "aly-bain",
        "type": "artist",
        "name": "Aly Bain",
        "summary": "Shetland fiddler and broadcaster",
        "blurb": "Boys of the Lough and Transatlantic Sessions brought Shetland ringing style to global audiences.",
        "years": "1946–",
        "region": "Shetland",
        "url": "https://en.wikipedia.org/wiki/Aly_Bain",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Fiddle.jpg?width=320",
    },
    "hamish-henderson": {
        "id": "hamish-henderson",
        "type": "artist",
        "name": "Hamish Henderson",
        "summary": "Folk song collector, poet, and revival activist",
        "blurb": "Collected bothy ballads and campaigned for Scottish folk as living culture, not museum piece.",
        "years": "1919–2002",
        "region": "Perthshire / Edinburgh",
        "url": "https://en.wikipedia.org/wiki/Hamish_Henderson",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Alan_Lomax.jpg?width=320",
    },
}

WALES_ARTISTS = {
    "nansi-richards": {
        "id": "nansi-richards",
        "type": "artist",
        "name": "Nansi Richards",
        "summary": "Triple harpist known as Queen of the Harp",
        "blurb": "1888–1979; bridged chapel, eisteddfod, and folk revival repertoire on telyn deires.",
        "years": "1888–1979",
        "region": "Wales",
        "url": "https://en.wikipedia.org/wiki/Nansi_Richards",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Welsh_triple_harp.jpg?width=320",
    },
    "llio-rhydderch": {
        "id": "llio-rhydderch",
        "type": "artist",
        "name": "Llio Rhydderch",
        "summary": "Contemporary triple harpist and composer",
        "blurb": "Performs penillion, folk sets, and new works on historical and modern harps.",
        "years": "1974–",
        "region": "Wales",
        "url": "https://en.wikipedia.org/wiki/Llio_Rhydderch",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Welsh_triple_harp.jpg?width=320",
    },
}

BRITTANY_ARTISTS = {
    "alan-stivell": {
        "id": "alan-stivell",
        "type": "artist",
        "name": "Alan Stivell",
        "summary": "Breton harpist and fusion pioneer",
        "blurb": "Renaissance de la Harpe Celtique (1972) and fest-noz stages linked Brittany to pan-Celtic networks.",
        "years": "1944–",
        "region": "Brittany",
        "url": "https://en.wikipedia.org/wiki/Alan_Stivell",
        "image": "https://en.wikipedia.org/wiki/Special:FilePath/Alan_Stivell.jpg?width=320",
    },
}

EXTRA_READING: dict[str, dict[str, list[dict]]] = {
    "scotland": {
        "regions-celtic-scotland-01-overview": [
            {"type": "book", "title": "The Highland Bagpipe", "author": "Joshua Dickson", "note": "Piping history and competition"},
            {"type": "link", "title": "National Piping Centre", "url": "https://www.thepipingcentre.co.uk/", "note": "Lessons and archives"},
            {"type": "link", "title": "Shetland Folk Festival", "url": "https://www.shetlandfolkfestival.com/", "note": "Island tradition showcase"},
            {"type": "link", "title": "BBC Radio Scotland — Travelling Folk", "url": "https://www.bbc.co.uk/sounds", "note": "Contemporary trad broadcasting"},
        ],
        "regions-celtic-scotland-02-instruments-voices-i": [
            {"type": "book", "title": "The Scottish Violinist", "author": "James Scott Skinner", "note": "Strathspey and reel collections"},
            {"type": "link", "title": "Aly Bain — discography", "url": "https://en.wikipedia.org/wiki/Aly_Bain", "note": "Shetland fiddle reference"},
            {"type": "link", "title": "Hamish Moore — smallpipes", "url": "https://en.wikipedia.org/wiki/Hamish_Moore", "note": "Revival maker and player"},
            {"type": "link", "title": "Clarsach Society", "url": "https://www.clarsachsociety.co.uk/", "note": "Scottish harp teachers and events"},
        ],
        "regions-celtic-scotland-03-instruments-voices-ii": [
            {"type": "book", "title": "The Accordion in Scottish Traditional Music", "author": "Gary West", "note": "Box in ceilidh bands"},
            {"type": "link", "title": "Phil Cunningham", "url": "https://en.wikipedia.org/wiki/Phil_Cunningham_(musician)", "note": "Accordion in folk revival"},
        ],
        "regions-celtic-scotland-05-dance": [
            {"type": "book", "title": "Traditional Dancing in Scotland", "author": "J. F. Flett", "note": "Ceilidh and country dance figures"},
            {"type": "link", "title": "Royal Scottish Country Dance Society", "url": "https://www.rscds.org/", "note": "Dance classes worldwide"},
        ],
        "regions-celtic-scotland-07-representative-depth": [
            {"type": "album", "title": "Home Is Where the Van Is", "author": "Battlefield Band", "note": "Revival ensemble landmark"},
            {"type": "album", "title": "Delirium", "author": "Capercaillie", "note": "Gaelic fusion"},
            {"type": "link", "title": "Celtic Connections", "url": "https://www.celticconnections.com/", "note": "Glasgow winter festival"},
        ],
        "regions-celtic-scotland-04-genres-forms": [
            {"type": "book", "title": "Dance to the Piper", "author": "George S. Emmerson", "note": "Scottish dance music history"},
            {"type": "link", "title": "The Session — strathspeys", "url": "https://thesession.org/tunes", "note": "Cross-reference tune types"},
            {"type": "link", "title": "Piobaireachd Society", "url": "https://www.piobaireachd.co.uk/", "note": "Ceòl mòr scores and history"},
        ],
        "regions-celtic-scotland-06-history": [
            {"type": "book", "title": "Alias MacAlias: Selected Writings", "author": "Hamish Henderson", "note": "Ballads and revival essays"},
            {"type": "link", "title": "School of Scottish Studies Archives", "url": "https://www.ed.ac.uk/literatures-languages-cultures/celtic-scottish-studies/archives", "note": "Field recordings"},
            {"type": "link", "title": "Gaelic college Sabhal Mòr Ostaig", "url": "https://www.smo.uhi.ac.uk/", "note": "Gaelic song and culture"},
        ],
        "regions-celtic-scotland-08-tunes": [
            {"type": "link", "title": "The Session — Mason's Apron", "url": "https://thesession.org/tunes/search?q=mason%27s+apron", "note": "Settings and recordings"},
            {"type": "book", "title": "The Harp Key", "author": "Alasdair Fraser", "note": "Fiddle repertoire notes"},
            {"type": "link", "title": "Skinner manuscript collections", "url": "https://www.aberdeen.gov.uk/", "note": "North East archival sources"},
        ],
    },
    "wales": {
        "regions-celtic-wales-01-overview": [
            {"type": "book", "title": "Welsh Folk Customs", "author": "Trefor M. Owen", "note": "Eisteddfod and community context"},
            {"type": "link", "title": "National Eisteddfod of Wales", "url": "https://eisteddfod.wales/", "note": "Annual competitive festival"},
            {"type": "link", "title": "Trac Cymru", "url": "https://www.trac-cymru.org/", "note": "Folk development organisation"},
        ],
        "regions-celtic-wales-02-instruments-voices-i": [
            {"type": "book", "title": "The Triple Harp", "author": "Ann Griffiths", "note": "Technique and penillion context"},
            {"type": "link", "title": "Nansi Richards biography", "url": "https://en.wikipedia.org/wiki/Nansi_Richards", "note": "Queen of the Harp legacy"},
            {"type": "link", "title": "Ceredigion Museum — crwth", "url": "https://www.ceredigionmuseum.wales/", "note": "Historic instrument displays"},
        ],
        "regions-celtic-wales-08-tunes": [
            {"type": "link", "title": "Ar Lan y Môr — song history", "url": "https://en.wikipedia.org/wiki/Ar_Lan_y_M%C3%B4r", "note": "Welsh folk standard"},
            {"type": "link", "title": "Cader Idris — tune background", "url": "https://en.wikipedia.org/wiki/Cadair_Idris", "note": "Mountain namesake tune"},
        ],
    },
    "brittany": {
        "regions-celtic-brittany-01-overview": [
            {"type": "book", "title": "Breton Folk Music", "author": "Ronan Gorgil", "note": "Fest-noz and kan ha diskan overview"},
            {"type": "link", "title": "Festival Interceltique de Lorient", "url": "https://www.festival-interceltique.com/", "note": "Pan-Celtic meeting point"},
            {"type": "link", "title": "Dastum archives", "url": "https://www.dastum.net/", "note": "Breton folk collection"},
        ],
        "regions-celtic-brittany-06-history": [
            {"type": "book", "title": "Alan Stivell: Racines", "author": "Alan Stivell", "note": "Autobiographical revival context"},
            {"type": "link", "title": "Bagad championships", "url": "https://en.wikipedia.org/wiki/Bagad", "note": "Pipe band revival institutions"},
        ],
        "regions-celtic-brittany-08-tunes": [
            {"type": "link", "title": "Suite Sudarmoricaine", "url": "https://en.wikipedia.org/wiki/Alan_Stivell", "note": "Stivell fest-noz repertoire"},
            {"type": "link", "title": "Bodadeg ar Sonerion", "url": "https://www.bodadeg.org/", "note": "Bombard and binou association"},
        ],
    },
    "diaspora": {
        "regions-celtic-diaspora-01-cape-breton": [
            {"type": "book", "title": "The Cape Breton Fiddle Companion", "author": "Sheldon MacInnes", "note": "Fiddle and dance history"},
            {"type": "link", "title": "Celtic Colours Festival", "url": "https://celtic-colours.com/", "note": "Nova Scotia showcase"},
        ],
        "regions-celtic-diaspora-04-pan-celtic-festivals": [
            {"type": "link", "title": "Celtic Connections", "url": "https://www.celticconnections.com/", "note": "Glasgow winter festival"},
            {"type": "link", "title": "Lorient Interceltique", "url": "https://www.festival-interceltique.com/", "note": "Largest pan-Celtic gathering"},
        ],
    },
    "comparative": {
        "regions-celtic-comparative-01-what-celtic-means": [
            {"type": "book", "title": "The Companion to Irish Traditional Music", "author": "Fintan Vallely", "note": "Cross-reference for 'Celtic' marketing critique"},
            {"type": "link", "title": "Pan-Celticism — Wikipedia", "url": "https://en.wikipedia.org/wiki/Pan-Celticism", "note": "Political and cultural network history"},
        ],
        "regions-celtic-comparative-04-revivals-compared": [
            {"type": "book", "title": "The Chief: The Life of Francis O'Neill", "author": "Nicholas Carolan", "note": "Irish collector case study"},
            {"type": "link", "title": "ITMA archives", "url": "https://www.itma.ie/", "note": "Irish transmission model"},
            {"type": "link", "title": "Dastum — Breton archives", "url": "https://www.dastum.net/", "note": "Parallel Breton collecting"},
        ],
    },
}

META_PATCHES: dict[str, dict[str, dict]] = {
    "scotland": {
        "regions-celtic-scotland-02-instruments-voices-i": {
            "add_entities": ["james-scott-skinner", "aly-bain"],
            "add_playlist": [
                {
                    "id": "skinner-strathspey",
                    "entity_id": "james-scott-skinner",
                    "label": "James Scott Skinner — strathspey",
                    "youtube": "https://www.youtube.com/watch?v=1q8n1vL5v5Y",
                },
                {
                    "id": "aly-bain-shetland",
                    "entity_id": "aly-bain",
                    "label": "Aly Bain — Shetland fiddle",
                    "youtube": "https://www.youtube.com/watch?v=5K6FwA7uAfw",
                },
            ],
        },
        "regions-celtic-scotland-06-history": {
            "add_entities": ["hamish-henderson"],
            "add_playlist": [
                {
                    "id": "henderson-ballad",
                    "entity_id": "hamish-henderson",
                    "label": "Hamish Henderson — ballad context",
                    "youtube": "https://www.youtube.com/watch?v=2g6F8h8aZ0E",
                },
            ],
        },
        "regions-celtic-scotland-08-tunes": {
            "add_entities": ["james-scott-skinner", "aly-bain"],
            "tunes": [
                {
                    "id": "masons-apron",
                    "type": "tune",
                    "name": "The Mason's Apron",
                    "form": "reel",
                    "reference": "Nineteenth-century Scottish and Irish collections",
                    "about": "Cross-border session standard — compare Scottish drive with Irish roll-heavy settings.",
                    "made_famous_by": ["james-scott-skinner", "aly-bain"],
                    "playlist": [
                        {
                            "entity_id": "james-scott-skinner",
                            "label": "James Scott Skinner",
                            "youtube": "https://www.youtube.com/watch?v=5K6FwA7uAfw",
                        },
                        {
                            "entity_id": "aly-bain",
                            "label": "Aly Bain",
                            "youtube": "https://www.youtube.com/watch?v=8jLOx1hD3_o",
                        },
                    ],
                },
                {
                    "id": "drummond-castle",
                    "type": "tune",
                    "name": "Drummond Castle Strathspey",
                    "form": "strathspey",
                    "reference": "Perthshire estate tune; competition and ceilidh repertoire",
                    "about": "Trains the ear for Scottish snap — dotted long-short pulse.",
                    "made_famous_by": ["james-scott-skinner"],
                    "playlist": [
                        {
                            "entity_id": "james-scott-skinner",
                            "label": "Skinner strathspey style",
                            "youtube": "https://www.youtube.com/watch?v=1q8n1vL5v5Y",
                        },
                    ],
                },
                {
                    "id": "moneymusk",
                    "type": "tune",
                    "name": "Moneymusk",
                    "form": "strathspey",
                    "reference": "Neil Gow era; widely played in Scotland and Cape Breton",
                    "about": "Session and dance classic — often paired with reels in ceilidh sets.",
                    "playlist": [
                        {
                            "label": "Strathspey–reel set",
                            "youtube": "https://www.youtube.com/watch?v=8jLOx1hD3_o",
                        },
                    ],
                },
            ],
        },
    },
    "wales": {
        "regions-celtic-wales-02-instruments-voices-i": {
            "add_entities": ["nansi-richards", "llio-rhydderch"],
            "add_playlist": [
                {
                    "id": "nansi-harp",
                    "entity_id": "nansi-richards",
                    "label": "Nansi Richards — triple harp",
                    "youtube": "https://www.youtube.com/watch?v=VqrUm7Qn8tc",
                },
            ],
        },
        "regions-celtic-wales-08-tunes": {
            "add_entities": ["nansi-richards"],
            "tunes": [
                {
                    "id": "ar-lan-y-mor",
                    "type": "tune",
                    "name": "Ar Lan y Môr",
                    "form": "waltz / song air",
                    "reference": "Welsh folk song standard; harp and voice settings",
                    "about": "Beloved seaside song — compare harp accompaniment with penillion counter-melody.",
                    "made_famous_by": ["nansi-richards"],
                    "playlist": [
                        {
                            "entity_id": "nansi-richards",
                            "label": "Harp and song setting",
                            "youtube": "https://www.youtube.com/watch?v=VqrUm7Qn8tc",
                        },
                    ],
                },
                {
                    "id": "cader-idris",
                    "type": "tune",
                    "name": "Cader Idris",
                    "form": "air / march",
                    "reference": "Named for Cadair Idris mountain; fiddle and harp repertoire",
                    "about": "North Wales tune associated with landscape and eisteddfod performance.",
                    "playlist": [
                        {
                            "label": "Fiddle and harp duet",
                            "youtube": "https://www.youtube.com/watch?v=1XgcXJzojxM",
                        },
                    ],
                },
            ],
        },
    },
    "brittany": {
        "regions-celtic-brittany-07-representative-depth": {
            "add_entities": ["alan-stivell"],
            "add_playlist": [
                {
                    "id": "stivell-renaissance",
                    "entity_id": "alan-stivell",
                    "label": "Alan Stivell — Renaissance de la Harpe Celtique",
                    "youtube": "https://www.youtube.com/watch?v=0kZ6v4W3wXQ",
                },
            ],
        },
        "regions-celtic-brittany-08-tunes": {
            "add_entities": ["alan-stivell"],
            "tunes": [
                {
                    "id": "suite-sudarmoricaine",
                    "type": "tune",
                    "name": "Suite Sudarmoricaine",
                    "form": "gavotte / fest-noz set",
                    "reference": "Alan Stivell; Breton dance suite",
                    "about": "Gateway to fest-noz listening — dance pulse and bombard timbre.",
                    "made_famous_by": ["alan-stivell"],
                    "playlist": [
                        {
                            "entity_id": "alan-stivell",
                            "label": "Alan Stivell live",
                            "youtube": "https://www.youtube.com/watch?v=0kZ6v4W3wXQ",
                        },
                    ],
                },
                {
                    "id": "an-alarc'h",
                    "type": "tune",
                    "name": "An Alarc'h",
                    "form": "kan ha diskan / gavotte",
                    "reference": "Breton song and dance standard",
                    "about": "Call-and-response song often heard at fest-noz; compare with Irish lilting.",
                    "playlist": [
                        {
                            "label": "Fest-noz performance",
                            "youtube": "https://www.youtube.com/watch?v=GvJ7WMEeR6c",
                        },
                    ],
                },
            ],
        },
    },
}

MARKDOWN_INSERTS: dict[str, dict[str, str]] = {
    "scotland/02-instruments-traditional-voices-i.md": {
        "anchor": "[[entity:shetland-fiddle]] tradition is among Scotland's most distinctive",
        "insert": "\n### Famous players and memorable details\n\n**James Scott Skinner** (1843–1927), the \"Strathspey King,\" composed *The Bonnie Lass of Bon Accord* and *Hector the Hero* while touring as dancer and fiddler. His Victorian showmanship fixed strathspey repertoire for competition pipers and ceilidh bands alike. **Memorable detail:** Skinner marketed himself with photographs and composed pieces dedicated to patrons — trad entrepreneurship before the word \"brand\" dominated music.\n\n**Aly Bain** (born 1946, Shetland) brought **ringing open-string** fiddle to television through *Boys of the Lough* and *Transatlantic Sessions*. His duets with Irish fiddlers model healthy cross-border listening. **Memorable detail:** Bain's bow arm favours **clarity over flash** — a Shetland lesson in ensemble discipline.\n\n",
    },
    "scotland/08-tunes.md": {
        "anchor": "[[entity:masons-apron]] belongs in every Scottish learner's ear-training list",
        "insert": "\nUse **Play all** at the top of the tune panel to hear curated examples, or tap ▶ beside each player row. Compare at least two settings before treating one as \"the\" version.\n\n",
    },
    "wales/02-instruments-traditional-voices-i.md": {
        "anchor": "[[entity:triple-harp]] appears on eisteddfod stages",
        "insert": "\n### Famous players and memorable details\n\n**Nansi Richards** (1888–1979), *Brenhines y Delyn* (Queen of the Harp), performed penillion and folk sets when triple harp seemed endangered. **Llio Rhydderch** continues the tradition with contemporary compositions and eisteddfod teaching. **Memorable detail:** Richards played for royalty and chapel alike — harp prestige in Wales spans sacred and competitive stages.\n\n",
    },
    "brittany/07-representative-depth.md": {
        "anchor": "[[entity:stivell]]",
        "insert": " — listen to *Renaissance de la Harpe Celtique* (1972) before judging Breton fusion by festival staging alone. ",
    },
}

ARTIST_POOLS = {
    "scotland": SCOTLAND_ARTISTS,
    "wales": WALES_ARTISTS,
    "brittany": BRITTANY_ARTISTS,
}
