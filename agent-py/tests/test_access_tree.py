import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import access_tree  # noqa: E402


def make_tree(base: Path, paths: list[str]):
    for p in paths:
        (base / p).mkdir(parents=True, exist_ok=True)


class ScanTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_relative_backslash_paths_breadth_first_and_depth_limited(self):
        make_tree(self.root, ["פרויקטים/תכנון/היתרים/ישן", "פרויקטים/ביצוע", "כספים"])
        (self.root / "כספים" / "דוח.xlsx").write_text("not a folder")
        self.assertEqual(
            access_tree.scan(str(self.root), depth=3),
            ["כספים", "פרויקטים", "פרויקטים\\ביצוע", "פרויקטים\\תכנון", "פרויקטים\\תכנון\\היתרים"],
        )
        self.assertEqual(access_tree.scan(str(self.root), depth=1), ["כספים", "פרויקטים"])

    def test_skips_hidden_system_excluded_and_links(self):
        make_tree(self.root, [".git", "$RECYCLE.BIN", "~tmp", "System Volume Information", "ארכיון", "פרויקטים"])
        if hasattr(os, "symlink"):
            os.symlink(self.root / "פרויקטים", self.root / "קישור")
        self.assertEqual(access_tree.scan(str(self.root), depth=2, exclude={"ארכיון"}), ["פרויקטים"])

    def test_unreadable_folder_is_left_out(self):
        make_tree(self.root, ["פתוח/בפנים", "נעול/בפנים"])
        real = os.scandir

        def scandir(path):
            if str(path).endswith("נעול"):
                raise PermissionError("denied")
            return real(path)

        with mock.patch.object(access_tree.os, "scandir", side_effect=scandir):
            self.assertEqual(access_tree.scan(str(self.root), depth=2), ["נעול", "פתוח", "פתוח\\בפנים"])

    def test_stops_at_the_limit(self):
        make_tree(self.root, [f"f{i:02d}" for i in range(10)])
        self.assertEqual(len(access_tree.scan(str(self.root), depth=2, limit=4)), 4)


class RunTest(unittest.TestCase):
    def test_never_sends_an_empty_scan(self):
        with tempfile.TemporaryDirectory() as empty, \
                mock.patch.object(access_tree, "ROOT", empty), \
                mock.patch.object(access_tree, "send") as send:
            self.assertIsNone(access_tree.run_once())
            send.assert_not_called()

    def test_unreachable_root_sends_nothing(self):
        with mock.patch.object(access_tree, "ROOT", "/no/such/share"), mock.patch.object(access_tree, "send") as send:
            self.assertIsNone(access_tree.run_once())
            send.assert_not_called()

    def test_send_posts_system_key_and_paths(self):
        response = mock.Mock(status_code=200)
        response.json.return_value = {"ok": True, "result": {"added": 2}}
        with mock.patch.object(access_tree, "INGEST_URL", "https://x.supabase.co/functions/v1"), \
                mock.patch.object(access_tree, "SYSTEM_ID", "sys"), \
                mock.patch.object(access_tree, "TOKEN", "key"), \
                mock.patch.object(access_tree.requests, "post", return_value=response) as post:
            self.assertEqual(access_tree.send(["a", "a\\b"]), {"added": 2})
        url = post.call_args.args[0]
        kwargs = post.call_args.kwargs
        self.assertEqual(url, "https://x.supabase.co/functions/v1/ingest-access-tree")
        self.assertEqual(kwargs["headers"], {"Authorization": "Bearer key"})
        self.assertEqual(kwargs["json"]["system_id"], "sys")
        self.assertEqual(kwargs["json"]["paths"], ["a", "a\\b"])

    def test_refused_key_says_what_to_do(self):
        with mock.patch.object(access_tree.requests, "post", return_value=mock.Mock(status_code=401)):
            with self.assertRaisesRegex(RuntimeError, "new one"):
                access_tree.send(["a"])


if __name__ == "__main__":
    unittest.main()
