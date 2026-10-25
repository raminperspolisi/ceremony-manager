"""Upload bot.py and run_bot.py to Bot-Hosting over SFTP.

Install the optional client with:
    python -m pip install paramiko

Create the SFTP password in the deployment's SFTP tab before running this file.
"""

import base64
import hashlib
import posixpath
from datetime import datetime, timezone
from getpass import getpass
from pathlib import Path

DEPLOYMENT_FILES = ("bot.py", "run_bot.py")

try:
    import paramiko
except ImportError as error:
    raise SystemExit(
        "SFTP dependency is missing. Install it with: "
        "python -m pip install paramiko"
    ) from error


class VerifyFingerprintPolicy(paramiko.MissingHostKeyPolicy):
    def __init__(self):
        self.accepted_fingerprint = None

    def missing_host_key(self, client, hostname, key):
        fingerprint = host_fingerprint(key)
        print(f"Unrecognized SFTP host key for {hostname}: {fingerprint}")
        expected = input(
            "Compare this with the fingerprint from a trusted SFTP client. "
            "Enter the exact fingerprint to trust this connection: "
        ).strip()
        if expected != fingerprint:
            raise paramiko.SSHException("SFTP host key fingerprint was not verified.")
        self.accepted_fingerprint = fingerprint
        client.get_host_keys().add(hostname, key.get_name(), key)


def host_fingerprint(key):
    digest = hashlib.sha256(key.asbytes()).digest()
    encoded = base64.b64encode(digest).decode("ascii").rstrip("=")
    return f"SHA256:{encoded}"


def upload_deployment_files(sftp, local_files, remote_root):
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    targets = []
    for local_file in local_files:
        name = local_file.name
        targets.append({
            "local": local_file,
            "remote": posixpath.join(remote_root, name),
            "staged_path": posixpath.join(
                remote_root,
                f"{name}.uploading-{timestamp}",
            ),
            "backup": posixpath.join(remote_root, f"{name}.backup-{timestamp}"),
            "size": local_file.stat().st_size,
            "backed_up": False,
            "installed": False,
            "staged_uploaded": False,
        })

    print("Files to upload:")
    for target in targets:
        print(f"  {target['local'].name} -> {target['remote']}")
    if input("Type UPLOAD to continue: ").strip() != "UPLOAD":
        raise SystemExit("Upload cancelled.")

    try:
        for target in targets:
            sftp.put(str(target["local"]), target["staged_path"])
            target["staged_uploaded"] = True
            uploaded_size = sftp.stat(target["staged_path"]).st_size
            if uploaded_size != target["size"]:
                raise RuntimeError(
                    f"Uploaded size mismatch for {target['local'].name}."
                )

        remote_names = set(sftp.listdir(remote_root))
        for target in targets:
            if posixpath.basename(target["remote"]) in remote_names:
                sftp.rename(target["remote"], target["backup"])
                target["backed_up"] = True

        for target in targets:
            sftp.rename(target["staged_path"], target["remote"])
            target["staged_uploaded"] = False
            target["installed"] = True
    except Exception as error:
        rollback_errors = []
        for target in reversed(targets):
            if target["installed"]:
                try:
                    sftp.remove(target["remote"])
                except OSError as rollback_error:
                    rollback_errors.append(str(rollback_error))
        for target in reversed(targets):
            if target["backed_up"]:
                try:
                    sftp.rename(target["backup"], target["remote"])
                except OSError as rollback_error:
                    rollback_errors.append(str(rollback_error))
        for target in targets:
            if target["staged_uploaded"]:
                try:
                    sftp.remove(target["staged_path"])
                except Exception as rollback_error:
                    rollback_errors.append(str(rollback_error))
        if rollback_errors:
            raise RuntimeError(
                f"Deployment failed ({error}); rollback also failed: "
                + "; ".join(rollback_errors)
            ) from error
        raise

    for target in targets:
        print(f"Uploaded {target['remote']} ({target['size']:,} bytes).")
        if target["backed_up"]:
            print(f"Previous file retained as: {target['backup']}")


def main():
    local_files = [
        Path(__file__).resolve().with_name(name)
        for name in DEPLOYMENT_FILES
    ]
    missing_files = [str(path) for path in local_files if not path.is_file()]
    if missing_files:
        raise SystemExit(
            "Deployment file(s) not found: " + ", ".join(missing_files)
        )

    host = input("SFTP host shown in Bot-Hosting: ").strip()
    if not host:
        raise SystemExit("SFTP host is required.")

    port_text = input("SFTP port [22]: ").strip() or "22"
    try:
        port = int(port_text)
    except ValueError as error:
        raise SystemExit("SFTP port must be a number.") from error
    if not 1 <= port <= 65535:
        raise SystemExit("SFTP port must be between 1 and 65535.")

    username = input("SFTP username shown in Bot-Hosting: ").strip()
    if not username:
        raise SystemExit("SFTP username is required.")
    password = getpass("SFTP password (input is hidden): ")
    if not password:
        raise SystemExit("SFTP password is required.")

    for local_file in local_files:
        print(f"Local file: {local_file}")
    print(f"SFTP server: {host}:{port}")

    client = paramiko.SSHClient()
    client.load_system_host_keys()
    fingerprint_policy = VerifyFingerprintPolicy()
    client.set_missing_host_key_policy(fingerprint_policy)

    try:
        client.connect(
            hostname=host,
            port=port,
            username=username,
            password=password,
            look_for_keys=False,
            allow_agent=False,
            timeout=20,
            banner_timeout=20,
            auth_timeout=20,
        )
        server_key = client.get_transport().get_remote_server_key()
        fingerprint = host_fingerprint(server_key)
        print(f"SFTP server fingerprint: {fingerprint}")
        if fingerprint_policy.accepted_fingerprint != fingerprint:
            expected = input(
                "Compare this with the fingerprint from a trusted SFTP client. "
                "Enter the exact fingerprint to continue: "
            ).strip()
            if expected != fingerprint:
                raise SystemExit("SFTP host key fingerprint was not verified.")

        with client.open_sftp() as sftp:
            remote_root = sftp.normalize(".")
            print(f"Remote deployment root: {remote_root}")
            upload_deployment_files(sftp, local_files, remote_root)
    except paramiko.BadHostKeyException as error:
        raise SystemExit(
            "SFTP host key did not match the saved host key. Verify the host "
            "and its fingerprint with Bot-Hosting before continuing."
        ) from error
    except paramiko.SSHException as error:
        raise SystemExit(
            "SFTP connection failed. Check the host, port, credentials, and "
            "the saved host key."
        ) from error
    finally:
        client.close()

    print("Both files uploaded. Restart the deployment from its Bot-Hosting panel.")


if __name__ == "__main__":
    main()
