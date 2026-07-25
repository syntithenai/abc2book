import unittest

from export_lessons import auto_link_tracks


class AutoLinkTracksTest(unittest.TestCase):
    def test_artist_comma_tune_links_ambiguous_label(self):
        body = '| Rock identity | Thin Lizzy, "Whiskey in the Jar" | Trad tune |'
        playlist = [
            {
                "id": "dubliners-whiskey",
                "entity_id": "dubliners",
                "label": "Whiskey in the Jar",
            },
            {
                "id": "thin-lizzy-whiskey",
                "entity_id": "thin-lizzy",
                "label": "Whiskey in the Jar",
            },
        ]
        entities = [
            {"id": "dubliners", "name": "The Dubliners"},
            {"id": "thin-lizzy", "name": "Thin Lizzy"},
        ]
        linked = auto_link_tracks(body, playlist, entities)
        self.assertIn("[[track:thin-lizzy-whiskey|Whiskey in the Jar]]", linked)
        self.assertNotIn("dubliners-whiskey", linked)

    def test_section_heading_prefers_matching_entity_for_ambiguous_tune(self):
        body = "\n".join([
            "## 12. Thin Lizzy",
            "",
            '- **"Whiskey in the Jar"** (1972) — trad tune, rock arrangement',
        ])
        playlist = [
            {
                "id": "dubliners-whiskey",
                "entity_id": "dubliners",
                "label": "Whiskey in the Jar",
            },
            {
                "id": "thin-lizzy-whiskey",
                "entity_id": "thin-lizzy",
                "label": "Whiskey in the Jar",
            },
        ]
        entities = [
            {"id": "dubliners", "name": "The Dubliners"},
            {"id": "thin-lizzy", "name": "Thin Lizzy"},
        ]
        linked = auto_link_tracks(body, playlist, entities)
        self.assertIn("[[track:thin-lizzy-whiskey|", linked)

    def test_wild_rover_links_per_section_artist(self):
        body = "\n".join([
            "## 3. The Clancy Brothers and Tommy Makem",
            "",
            '- Songs: **"The Wild Rover"**',
            "",
            "## 4. The Dubliners",
            "",
            '- **"The Wild Rover"**, **"Molly Malone"**',
        ])
        playlist = [
            {
                "id": "clancy-wild-rover",
                "entity_id": "clancy-brothers",
                "label": "Wild Rover",
            },
            {
                "id": "dubliners-wild-rover",
                "entity_id": "dubliners",
                "label": "Wild Rover",
            },
        ]
        entities = [
            {"id": "clancy-brothers", "name": "The Clancy Brothers and Tommy Makem"},
            {"id": "dubliners", "name": "The Dubliners"},
        ]
        linked = auto_link_tracks(body, playlist, entities)
        clancy_pos = linked.index("clancy-wild-rover")
        dubliners_pos = linked.index("dubliners-wild-rover")
        self.assertLess(clancy_pos, dubliners_pos)

    def test_unique_tune_title_still_links_globally(self):
        body = 'Hear **"Dearg Doom"** for Celtic rock.'
        playlist = [
            {
                "id": "horslips-dearg",
                "entity_id": "horslips",
                "label": "Dearg Doom",
            },
        ]
        entities = [{"id": "horslips", "name": "Horslips"}]
        linked = auto_link_tracks(body, playlist, entities)
        self.assertIn("[[track:horslips-dearg|Dearg Doom]]", linked)


if __name__ == "__main__":
    unittest.main()
