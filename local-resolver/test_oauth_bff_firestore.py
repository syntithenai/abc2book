import os
import unittest
from unittest.mock import MagicMock, patch

import oauth_bff


class FirestoreSessionStoreTests(unittest.TestCase):
    def setUp(self):
        self.docs: dict[str, dict] = {}
        self.collection = MagicMock()
        self.collection.document.side_effect = lambda sid: self._doc_ref(sid)

        def where(field, op, value):
            query = MagicMock()

            def stream():
                for sid, data in list(self.docs.items()):
                    if field == "email" and op == "==" and data.get("email") == value:
                        doc = MagicMock()
                        doc.id = sid
                        doc.reference = self._doc_ref(sid)
                        yield doc

            query.stream = stream
            return query

        self.collection.where.side_effect = where
        self.client = MagicMock()
        self.client.collection.return_value = self.collection

        self.env = patch.dict(
            os.environ,
            {
                "AUTH_SESSION_STORE": "firestore",
                "AUTH_SESSION_FIRESTORE_PROJECT": "test-project",
                "AUTH_SESSION_FIRESTORE_COLLECTION": "oauth_sessions",
                "AUTH_REFRESH_TOKEN_FERNET_KEY": "",
            },
            clear=False,
        )
        self.env.start()
        oauth_bff.AUTH_SESSION_STORE = "firestore"
        oauth_bff.AUTH_SESSION_FIRESTORE_PROJECT = "test-project"
        oauth_bff.AUTH_SESSION_FIRESTORE_COLLECTION = "oauth_sessions"
        oauth_bff._firestore_client = self.client
        oauth_bff._db_initialized = False

    def tearDown(self):
        self.env.stop()
        oauth_bff.AUTH_SESSION_STORE = "sqlite"
        oauth_bff._firestore_client = None
        oauth_bff._refresh_locks = {}
        self.docs.clear()

    def _doc_ref(self, sid: str):
        ref = MagicMock()

        def get():
            doc = MagicMock()
            if sid in self.docs:
                doc.exists = True
                doc.to_dict.return_value = dict(self.docs[sid])
            else:
                doc.exists = False
            return doc

        def set(payload):
            self.docs[sid] = dict(payload)

        def update(payload):
            self.docs.setdefault(sid, {})
            self.docs[sid].update(payload)

        def delete():
            self.docs.pop(sid, None)

        ref.get = get
        ref.set = set
        ref.update = update
        ref.delete = delete
        return ref

    def test_upsert_and_get_session(self):
        sid = oauth_bff.upsert_session(
            email="user@example.com",
            refresh_token="refresh-token",
            scopes="email profile",
            allowed_for_media=True,
            session_id="sess-abc",
        )
        self.assertEqual(sid, "sess-abc")
        session = oauth_bff.get_session("sess-abc")
        self.assertIsNotNone(session)
        self.assertEqual(session["email"], "user@example.com")
        self.assertEqual(session["refresh_token"], "refresh-token")
        self.assertTrue(session["allowed_for_media"])

    def test_delete_session(self):
        oauth_bff.upsert_session(
            email="user@example.com",
            refresh_token="refresh-token",
            scopes="email",
            allowed_for_media=False,
            session_id="sess-del",
        )
        oauth_bff.delete_session("sess-del")
        self.assertIsNone(oauth_bff.get_session("sess-del"))

    def test_upsert_replaces_other_sessions_for_same_email(self):
        oauth_bff.upsert_session(
            email="user@example.com",
            refresh_token="old",
            scopes="email",
            allowed_for_media=False,
            session_id="old-sess",
        )
        oauth_bff.upsert_session(
            email="user@example.com",
            refresh_token="new",
            scopes="email",
            allowed_for_media=True,
            session_id="new-sess",
        )
        self.assertIsNone(oauth_bff.get_session("old-sess"))
        self.assertIsNotNone(oauth_bff.get_session("new-sess"))

    def test_touch_session_updates_last_used(self):
        oauth_bff.upsert_session(
            email="user@example.com",
            refresh_token="refresh",
            scopes="email",
            allowed_for_media=False,
            session_id="sess-touch",
        )
        before = self.docs["sess-touch"]["last_used_at"]
        oauth_bff.touch_session("sess-touch", scopes="email openid")
        after = self.docs["sess-touch"]["last_used_at"]
        self.assertGreaterEqual(after, before)
        self.assertEqual(self.docs["sess-touch"]["scopes"], "email openid")


if __name__ == "__main__":
    unittest.main()
