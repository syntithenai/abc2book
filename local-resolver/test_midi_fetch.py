import unittest
from unittest.mock import AsyncMock, patch

from midi_fetch import (
    annotate_midi_candidate,
    build_midi_broad_queries,
    build_midi_search_queries,
    extract_midi_file_urls_from_html,
    is_allowed_midi_host,
    is_direct_midi_file_url,
    midi_urls_from_search_results,
    title_from_midi_url,
)
from notation_fetch import (
    MAX_NOTATION_CANDIDATES,
    finalize_notation_candidates,
    search_notation,
    search_notation_midi_fallback,
)
from notation_title_variants import notation_title_variants
from musescore_fetch import annotate_musescore_candidate


MINIMAL_MUSICXML = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Test</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>
"""


class NotationTitleVariantTests(unittest.TestCase):
    def test_clare_clair_variants(self):
        variants = notation_title_variants("Clare de Lune")
        self.assertEqual(variants[0], "Clare de Lune")
        self.assertIn("Clair de Lune", variants)

    def test_clair_to_clare(self):
        variants = notation_title_variants("Clair de Lune")
        self.assertIn("Clare de Lune", variants)
        self.assertIn("Claire de Lune", variants)

    def test_claire_to_clair(self):
        variants = notation_title_variants("Claire de Lune")
        self.assertEqual(variants[0], "Claire de Lune")
        self.assertIn("Clair de Lune", variants)


class MidiFetchHelperTests(unittest.TestCase):
    def test_allowlist_and_direct_url(self):
        self.assertTrue(is_allowed_midi_host("www.bitmidi.com"))
        self.assertTrue(is_allowed_midi_host("archive.org"))
        self.assertFalse(is_allowed_midi_host("evil.example"))
        self.assertTrue(is_direct_midi_file_url("https://bitmidi.com/files/clair.mid"))
        self.assertTrue(is_direct_midi_file_url("https://example.com/a.midi"))
        self.assertFalse(is_direct_midi_file_url("https://bitmidi.com/clair-de-lune"))

    def test_build_queries_include_sites_and_variants(self):
        queries = build_midi_search_queries("Clare de Lune")
        self.assertTrue(any("site:bitmidi.com" in q for q in queries))
        self.assertTrue(any("site:midiworld.com" in q for q in queries))
        self.assertTrue(any("Clair de Lune" in q for q in queries))
        self.assertTrue(any("filetype:mid" in q for q in queries))

    def test_build_broad_queries_prioritize_archive_and_mutopia(self):
        queries = build_midi_broad_queries("Bach Cello Suite No. 1")
        self.assertTrue(any("site:mutopiaproject.org" in q for q in queries))
        self.assertTrue(any("site:archive.org" in q for q in queries))
        self.assertTrue(any("filetype:mid" in q for q in queries))

    def test_relaxed_search_accepts_direct_midi_from_any_host(self):
        results = [{
            "url": "https://example.org/scores/bach-cello-suite-1.mid",
            "title": "Bach Cello Suite",
        }]
        files, pages = midi_urls_from_search_results(results, allow_any_direct_midi=True)
        self.assertEqual(files, ["https://example.org/scores/bach-cello-suite-1.mid"])
        files_strict, _pages = midi_urls_from_search_results(results)
        self.assertEqual(files_strict, [])

    def test_extract_midi_from_html_and_search(self):
        html = """
        <html><body>
          <a href="/files/clair-de-lune.mid">Download</a>
          <a href="https://evil.example/bad.mid">nope</a>
        </body></html>
        """
        urls = extract_midi_file_urls_from_html(html, "https://bitmidi.com/clair")
        self.assertEqual(urls[0], "https://bitmidi.com/files/clair-de-lune.mid")
        files, pages = midi_urls_from_search_results([
            {
                "url": "https://example.com/other",
                "snippet": "See https://archive.org/download/x/clair.mid here",
            },
            {"url": "https://bitmidi.com/clair-de-lune"},
        ])
        self.assertIn("https://archive.org/download/x/clair.mid", files)
        self.assertIn("https://bitmidi.com/clair-de-lune", pages)

    def test_title_from_url_and_annotate(self):
        self.assertEqual(
            title_from_midi_url("https://bitmidi.com/files/clair_de_lune.mid", "Fallback"),
            "clair de lune",
        )
        candidate = annotate_midi_candidate(
            MINIMAL_MUSICXML,
            title="Clair de Lune",
            source_url="https://bitmidi.com/files/clair.mid",
        )
        self.assertEqual(candidate["source"], "bitmidi.com")
        self.assertEqual(candidate["tuneMeta"]["meta"]["importFormat"], "midi")
        self.assertIn("<score-partwise", candidate["musicXml"])


class MidiCascadeTests(unittest.IsolatedAsyncioTestCase):
    async def test_finalize_demotes_weak_session_when_midi_present(self):
        session = {
            "abc": "X:1\nT:Clare\nM:4/4\nL:1/8\nK:G\n|:G2|",
            "title": "Clare",
            "artist": "",
            "source": "thesession.org",
            "sourceUrl": "https://thesession.org/tunes/1",
            "preview": "X:1",
            "titleOnly": False,
        }
        midi = annotate_midi_candidate(
            MINIMAL_MUSICXML,
            title="Clair de Lune",
            source_url="https://bitmidi.com/files/clair.mid",
        )
        finalized = finalize_notation_candidates(
            [session, midi],
            "Clare de Lune",
            "",
        )
        sources = [c.get("source") for c in finalized]
        self.assertIn("bitmidi.com", sources)
        self.assertNotIn("thesession.org", sources)

    async def test_finalize_ranks_musescore_above_abc_above_midi(self):
        title = "Wild Rover"
        abc = {
            "abc": "X:1\nT:Wild Rover\nM:4/4\nL:1/8\nK:G\n|:G2|",
            "title": title,
            "artist": "",
            "source": "abcnotation.com",
            "sourceUrl": "https://abcnotation.com/1",
            "preview": "X:1",
            "titleOnly": False,
        }
        muse = annotate_musescore_candidate(
            MINIMAL_MUSICXML,
            title=title,
            source_url="https://musescore.com/user/1/scores/1",
            score_id="1",
        )
        midi = annotate_midi_candidate(
            MINIMAL_MUSICXML,
            title=title,
            source_url="https://bitmidi.com/files/wild-rover.mid",
        )
        finalized = finalize_notation_candidates([midi, abc, muse], title, "")
        self.assertEqual(len(finalized), 3)
        self.assertEqual(finalized[0]["source"], "musescore.com")
        self.assertEqual(finalized[1]["source"], "abcnotation.com")
        self.assertEqual(finalized[2]["source"], "bitmidi.com")
        self.assertGreater(finalized[0]["matchScore"], finalized[1]["matchScore"])
        self.assertGreater(finalized[1]["matchScore"], finalized[2]["matchScore"])

    async def test_finalize_caps_at_20(self):
        title = "Demo Tune"
        many = []
        for i in range(25):
            many.append({
                "abc": "X:1\nT:Demo Tune\nM:4/4\nL:1/8\nK:G\n|:G2|",
                "title": title,
                "artist": "",
                "source": "abcnotation.com",
                "sourceUrl": "https://abcnotation.com/%d" % i,
                "preview": "X:1",
                "titleOnly": False,
            })
        finalized = finalize_notation_candidates(many, title, "")
        self.assertEqual(len(finalized), MAX_NOTATION_CANDIDATES)

    async def test_search_notation_runs_midi_in_parallel(self):
        weak_session = {
            "abc": "X:1\nT:Clare\nM:4/4\nL:1/8\nK:G\n|:G2|",
            "title": "Clare",
            "artist": "",
            "source": "thesession.org",
            "sourceUrl": "https://thesession.org/tunes/1",
            "preview": "X:1",
            "titleOnly": False,
        }
        midi = annotate_midi_candidate(
            MINIMAL_MUSICXML,
            title="Clair de Lune",
            source_url="https://bitmidi.com/files/clair.mid",
        )

        with patch(
            "notation_fetch.collect_thesession_candidates",
            new_callable=AsyncMock,
            return_value=[weak_session],
        ), patch(
            "notation_fetch.collect_web_abc_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch.collect_musescore_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch.collect_midi_candidates",
            new_callable=AsyncMock,
            return_value=[midi],
        ) as midi_mock:
            body = await search_notation("Clare de Lune")

        midi_mock.assert_awaited()
        if body.get("multiple"):
            sources = [c.get("source") for c in body["candidates"]]
        else:
            sources = [body.get("source")]
        self.assertIn("bitmidi.com", sources)
        self.assertNotIn("thesession.org", sources)

    async def test_search_notation_still_runs_midi_with_strong_session(self):
        strong = {
            "abc": "X:1\nT:Clare de Lune\nM:4/4\nL:1/8\nK:C\n|:C2|",
            "title": "Clare de Lune",
            "artist": "",
            "source": "thesession.org",
            "sourceUrl": "https://thesession.org/tunes/9",
            "preview": "X:1",
            "titleOnly": False,
        }
        with patch(
            "notation_fetch.collect_thesession_candidates",
            new_callable=AsyncMock,
            return_value=[strong],
        ), patch(
            "notation_fetch.collect_web_abc_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch.collect_musescore_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch.collect_midi_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ) as midi_mock:
            body = await search_notation("Clare de Lune")

        midi_mock.assert_awaited()
        self.assertEqual(body["source"], "thesession.org")

    async def test_search_notation_last_chance_midi_when_parallel_empty(self):
        midi = annotate_midi_candidate(
            MINIMAL_MUSICXML,
            title="Bach Cello Suite No. 1",
            source_url="https://mutopiaproject.org/bach-cello.mid",
        )
        with patch(
            "notation_fetch.collect_thesession_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch.collect_web_abc_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch.collect_musescore_candidates",
            new_callable=AsyncMock,
            return_value={"candidates": [], "manualCandidates": [{
                "url": "https://musescore.com/user/1/scores/9",
                "title": "Bach Cello Suite No. 1",
                "source": "musescore.com",
                "host": "musescore.com",
                "reason": "blocked",
                "contentType": "notation",
            }]},
        ), patch(
            "notation_fetch.collect_midi_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch._last_chance_midi_candidates",
            new_callable=AsyncMock,
            return_value=[midi],
        ) as fallback_mock:
            body = await search_notation("Bach Cello Suite No. 1 For Violin")

        fallback_mock.assert_awaited()
        self.assertEqual(body["source"], "mutopiaproject.org")

    async def test_search_notation_midi_fallback_endpoint(self):
        midi = annotate_midi_candidate(
            MINIMAL_MUSICXML,
            title="Bach Cello Suite No. 1 For Violin",
            source_url="https://archive.org/bach.mid",
        )
        with patch(
            "notation_fetch.collect_local_midi_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch.collect_web_midi_candidates",
            new_callable=AsyncMock,
            return_value=[midi],
        ), patch(
            "notation_fetch._collect_abc_fallback_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ):
            body = await search_notation_midi_fallback("Bach Cello Suite No. 1 For Violin")
        self.assertEqual(body["source"], "archive.org")

    def test_finalize_secondary_fallback_requires_exact_title(self):
        from notation_fetch import (
            annotate_candidate,
            finalize_secondary_fallback_candidates,
            is_very_close_title_match,
        )

        close_abc = annotate_candidate(
            "X:1\nT:Hells Bells\nK:C\nC D E F|",
            "Hells Bells",
            "abcnotation.com",
            "https://abcnotation.com/hells-bells.abc",
        )
        wrong_abc = annotate_candidate(
            "X:1\nT:Black Joke\nK:D\n|:A2|",
            "Black Joke (jig)",
            "thesession.org",
            "https://thesession.org/tunes/1",
        )
        self.assertTrue(is_very_close_title_match(close_abc, "Hells Bells"))
        self.assertFalse(is_very_close_title_match(wrong_abc, "Hells Bells"))
        finalized = finalize_secondary_fallback_candidates(
            [wrong_abc, close_abc],
            "Hells Bells",
            "AC/DC",
        )
        self.assertEqual(len(finalized), 1)
        self.assertEqual(finalized[0]["title"], "Hells Bells")

    def test_finalize_relaxes_midi_threshold(self):
        midi = annotate_midi_candidate(
            MINIMAL_MUSICXML,
            title="Suite 1",
            source_url="https://bitmidi.com/suite.mid",
        )
        relaxed = finalize_notation_candidates(
            [midi],
            "Bach Cello Suite No. 1 For Violin",
            "",
            relax_midi=True,
        )
        self.assertEqual(len(relaxed), 1)
        self.assertEqual(relaxed[0]["source"], "bitmidi.com")


class MidiConvertSimplifyTests(unittest.TestCase):
    def test_simplify_drops_drums_and_extra_parts(self):
        from music21 import chord, instrument, note, stream
        from midi_convert import simplify_midi_score_for_notation

        score = stream.Score()
        melody = stream.Part()
        melody.insert(0, instrument.Flute())
        melody.append(note.Note("C4", quarterLength=1))
        melody.append(note.Note("E4", quarterLength=1))
        melody.append(note.Note("G4", quarterLength=1))

        bass = stream.Part()
        bass.insert(0, instrument.AcousticBass())
        bass.append(note.Note("C3", quarterLength=1))

        extra = stream.Part()
        extra.insert(0, instrument.Violin())
        extra.append(note.Note("A4", quarterLength=0.5))

        drums = stream.Part()
        drums.insert(0, instrument.BassDrum())
        try:
            drums.getElementsByClass("Instrument")[0].midiChannel = 9
        except Exception:
            pass
        drums.append(note.Note("C2", quarterLength=1))

        chordal = stream.Part()
        chordal.insert(0, instrument.Piano())
        chordal.append(chord.Chord(["C4", "E4", "G4"], quarterLength=1))
        chordal.append(chord.Chord(["D4", "F4", "A4"], quarterLength=1))
        chordal.append(note.Note("C4", quarterLength=1))

        score.insert(0, drums)
        score.insert(0, extra)
        score.insert(0, bass)
        score.insert(0, melody)

        simplified, _diag = simplify_midi_score_for_notation(score)
        part_count = len(list(simplified.parts))
        self.assertLessEqual(part_count, 2)
        # Drum part should be gone.
        for part in simplified.parts:
            for inst in part.recurse().getElementsByClass("Instrument"):
                channel = getattr(inst, "midiChannel", None)
                self.assertNotEqual(channel, 9)

    def test_simplify_flattens_chords_to_top_note(self):
        from music21 import chord, instrument, note, stream
        from midi_convert import simplify_midi_score_for_notation

        score = stream.Score()
        part = stream.Part()
        part.insert(0, instrument.Piano())
        part.append(chord.Chord(["C4", "E4", "G4"], quarterLength=1))
        part.append(chord.Chord(["D4", "F4", "A4"], quarterLength=1))
        score.insert(0, part)

        simplified, _diag = simplify_midi_score_for_notation(score)
        kept = list(simplified.parts)[0]
        notes = list(kept.recurse().notes)
        self.assertTrue(notes)
        self.assertFalse(any(getattr(n, "isChord", False) for n in notes))
        pitches = [n.pitch.nameWithOctave for n in notes if getattr(n, "isNote", False)]
        self.assertIn("G4", pitches)
        self.assertIn("A4", pitches)

    def test_simplify_prefers_melody_over_dense_chord_accompaniment(self):
        from music21 import chord, instrument, note, stream
        from midi_convert import simplify_midi_score_for_notation, _is_drum_part

        score = stream.Score()
        melody = stream.Part()
        melody.insert(0, instrument.Flute())
        for pitch in ("G4", "A4", "B4", "C5"):
            melody.append(note.Note(pitch, quarterLength=0.5))

        chords = stream.Part()
        chords.insert(0, instrument.Piano())
        for pitches in (["G3", "B3", "D4"], ["C3", "E3", "G3"], ["D3", "F3", "A3"], ["G3", "B3", "D4"]):
            chords.append(chord.Chord(pitches, quarterLength=0.5))
            chords.append(chord.Chord(pitches, quarterLength=0.5))

        score.insert(0, chords)
        score.insert(0, melody)

        self.assertFalse(_is_drum_part(chords))
        simplified, _diag = simplify_midi_score_for_notation(score)
        self.assertEqual(len(list(simplified.parts)), 1)
        kept = list(simplified.parts)[0]
        pitches = [
            n.pitch.nameWithOctave
            for n in kept.recurse().notes
            if getattr(n, "isNote", False)
        ]
        self.assertEqual(pitches[:4], ["G4", "A4", "B4", "C5"])


if __name__ == "__main__":
    unittest.main()
