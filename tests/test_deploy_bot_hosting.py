import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from deploy_bot_hosting import upload_deployment_files


class MemorySftp:
    def __init__(self, files=None, fail_install_name=None):
        self.files = dict(files or {})
        self.operations = []
        self.fail_install_name = fail_install_name
        self.failed_install = False

    def put(self, local_path, remote_path):
        self.operations.append(("put", remote_path))
        self.files[remote_path] = Path(local_path).read_bytes()

    def stat(self, remote_path):
        return SimpleNamespace(st_size=len(self.files[remote_path]))

    def listdir(self, remote_root):
        prefix = remote_root.rstrip("/") + "/"
        return [
            path[len(prefix):]
            for path in self.files
            if path.startswith(prefix) and "/" not in path[len(prefix):]
        ]

    def rename(self, source, destination):
        self.operations.append(("rename", source, destination))
        if (
            self.fail_install_name
            and not self.failed_install
            and destination.endswith(f"/{self.fail_install_name}")
        ):
            self.failed_install = True
            raise OSError("simulated install failure")
        self.files[destination] = self.files.pop(source)

    def remove(self, remote_path):
        self.operations.append(("remove", remote_path))
        del self.files[remote_path]


class UploadDeploymentFilesTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.paths = []
        for name, content in (
            ("bot.py", b"new entry point"),
            ("run_bot.py", b"new bot logic"),
        ):
            path = Path(self.temp_dir.name) / name
            path.write_bytes(content)
            self.paths.append(path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_uploads_both_files_and_keeps_backups(self):
        sftp = MemorySftp({
            "/deployment/bot.py": b"old entry point",
            "/deployment/run_bot.py": b"old bot logic",
        })

        with patch("builtins.input", return_value="UPLOAD"):
            upload_deployment_files(sftp, self.paths, "/deployment")

        self.assertEqual(sftp.files["/deployment/bot.py"], b"new entry point")
        self.assertEqual(sftp.files["/deployment/run_bot.py"], b"new bot logic")
        backups = {
            name: content
            for name, content in sftp.files.items()
            if ".backup-" in name
        }
        self.assertEqual(
            {Path(name.split(".backup-")[0]).name for name in backups},
            {"bot.py", "run_bot.py"},
        )
        self.assertEqual(
            set(backups.values()),
            {b"old entry point", b"old bot logic"},
        )
        self.assertFalse(any(".uploading-" in name for name in sftp.files))

    def test_does_not_upload_without_exact_confirmation(self):
        initial_files = {
            "/deployment/bot.py": b"old entry point",
            "/deployment/run_bot.py": b"old bot logic",
        }
        sftp = MemorySftp(initial_files)

        with patch("builtins.input", return_value="yes"):
            with self.assertRaisesRegex(SystemExit, "Upload cancelled"):
                upload_deployment_files(sftp, self.paths, "/deployment")

        self.assertEqual(sftp.files, initial_files)
        self.assertEqual(sftp.operations, [])

    def test_failed_second_install_restores_both_previous_files(self):
        initial_files = {
            "/deployment/bot.py": b"old entry point",
            "/deployment/run_bot.py": b"old bot logic",
        }
        sftp = MemorySftp(initial_files, fail_install_name="run_bot.py")

        with patch("builtins.input", return_value="UPLOAD"):
            with self.assertRaisesRegex(OSError, "simulated install failure"):
                upload_deployment_files(sftp, self.paths, "/deployment")

        self.assertEqual(sftp.files, initial_files)
        self.assertFalse(any(".uploading-" in name for name in sftp.files))


if __name__ == "__main__":
    unittest.main()
