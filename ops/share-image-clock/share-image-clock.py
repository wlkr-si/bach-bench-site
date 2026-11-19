#!/usr/bin/env python3
"""Poll the Vault and dispatch the Site image workflow only for stale images."""
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request

VAULT = "https://vault.bach.wlkr.si"
GITHUB = "https://api.github.com"
WORKFLOW = "/repos/wlkr-si/bach-bench-site/actions/workflows/share-images.yml"
SOURCES = (
    ("/index.json", "/derived/images/live/manifest.json"),
    ("/staging/site-98/index.json", "/derived/images/staging/site-98/manifest.json"),
)
ACTIVE = {"requested", "queued", "pending", "waiting", "in_progress"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        return None


opener = urllib.request.build_opener(NoRedirect())


def read_json(url, *, token=None, payload=None, missing=False):
    headers = {"User-Agent": "bach-bench-share-image-clock", "Cache-Control": "no-cache"}
    if url.startswith(GITHUB + "/"):
        headers.update({"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10"})
    if token:
        headers["Authorization"] = "Bearer " + token
    body = None
    if payload is not None:
        body = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers)
    try:
        with opener.open(request, timeout=15) as response:
            return json.load(response) if response.status != 204 else {}
    except urllib.error.HTTPError as error:
        if missing and error.code == 404:
            return None
        raise RuntimeError(f"HTTP {error.code} from {url}") from None


def outdated():
    for index_path, manifest_path in SOURCES:
        index = read_json(VAULT + index_path, missing=index_path != "/index.json")
        if index is None:
            continue
        revision = index.get("revision", "")
        if index.get("schemaVersion") != 1 or not re.fullmatch(r"[0-9a-f]{64}", revision):
            raise RuntimeError(f"Invalid Vault index at {index_path}")
        manifest = read_json(VAULT + manifest_path, missing=True)
        if manifest is None or manifest.get("revision") != revision:
            yield revision


def b64(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=")


def installation_token():
    now = int(time.time())
    header = b64(b'{"alg":"RS256","typ":"JWT"}')
    claims = b64(json.dumps({"iat": now - 30, "exp": now + 120, "iss": os.environ["BACH_GITHUB_APP_ID"]}).encode())
    data = header + b"." + claims
    key = Path(os.environ["CREDENTIALS_DIRECTORY"]) / "github-app.pem"
    signature = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", key],
        input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True,
    ).stdout
    jwt = (data + b"." + b64(signature)).decode()
    install = int(os.environ["BACH_GITHUB_INSTALLATION_ID"])
    response = read_json(GITHUB + f"/app/installations/{install}/access_tokens", token=jwt,
                         payload={"repositories": ["bach-bench-site"], "permissions": {"actions": "write"}})
    return response["token"]


def main():
    revisions = list(outdated())
    if not revisions:
        print("Share images match the Vault")
        return

    token = installation_token()
    runs = read_json(GITHUB + WORKFLOW + "/runs?branch=main&per_page=15", token=token)
    if any(run["status"] in ACTIVE for run in runs["workflow_runs"]):
        print("An image workflow is already active")
        return

    result = read_json(GITHUB + WORKFLOW + "/dispatches", token=token,
                       payload={"ref": "main", "inputs": {"trigger": "vault-clock"}})
    print("Dispatched an image refresh for", ", ".join(revisions), result.get("html_url", ""))


if __name__ == "__main__":
    main()
