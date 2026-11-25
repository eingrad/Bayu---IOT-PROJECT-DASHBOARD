"""
Portal logins: Client and Manufacturer.

* Client       = the existing portal login (portal.username / portal.password in
                 config.yaml). Its calibrations save to the User level.
* Manufacturer = a separate login whose password is stored only as a salted
                 hash in calibration/manufacturer-login.json (never in git).
                 Its calibrations save to the Manufacturer level.

Set or change the manufacturer login on the Pi:

    python3 auth.py set-manufacturer <username>     # asks for the password

An empty portal.password turns auth off (development only); everyone is then
treated as the manufacturer.
"""
from __future__ import annotations

import getpass
import hashlib
import hmac
import json
import os
import secrets
import sys
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from config import CONFIG_PATH, load_config

security = HTTPBasic(auto_error=False)
MFR_FILE = CONFIG_PATH.parent / "calibration" / "manufacturer-login.json"
ITERATIONS = 200_000


def _hash(password: str, salt: bytes, iterations: int = ITERATIONS) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


def manufacturer_username() -> Optional[str]:
    try:
        return json.loads(MFR_FILE.read_text()).get("username")
    except Exception:
        return None


def _is_manufacturer(username: str, password: str) -> bool:
    try:
        d = json.loads(MFR_FILE.read_text())
        want = bytes.fromhex(d["hash"])
        salt = bytes.fromhex(d["salt"])
        iters = int(d.get("iterations", ITERATIONS))
    except Exception:
        return False
    if not secrets.compare_digest(username, str(d.get("username", ""))):
        return False
    return hmac.compare_digest(_hash(password, salt, iters), want)


def role_for(creds: Optional[HTTPBasicCredentials]) -> Optional[str]:
    """'manufacturer', 'client', or None (not signed in)."""
    portal = load_config().get("portal", {}) or {}
    want_user = str(portal.get("username") or "")
    want_pass = str(portal.get("password") or "")
    if creds is not None and _is_manufacturer(creds.username, creds.password):
        return "manufacturer"
    if not want_pass:
        return "manufacturer"  # auth disabled (development only)
    if (
        creds is not None
        and secrets.compare_digest(creds.username, want_user)
        and secrets.compare_digest(creds.password, want_pass)
    ):
        return "client"
    return None


def require_login(creds: HTTPBasicCredentials = Depends(security)) -> str:
    role = role_for(creds)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return role


def require_manufacturer(role: str = Depends(require_login)) -> str:
    if role != "manufacturer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the manufacturer login can do this")
    return role


def who(role: str, creds: Optional[HTTPBasicCredentials]) -> str:
    """Name shown in calibration records."""
    name = creds.username if creds is not None else ""
    return f"{name or 'manufacturer'} (manufacturer)" if role == "manufacturer" else (name or "client")


def set_manufacturer(username: str, password: str) -> None:
    if not username or len(password) < 8:
        raise ValueError("username required and password must be at least 8 characters")
    salt = secrets.token_bytes(16)
    MFR_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = MFR_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps({"username": username, "salt": salt.hex(), "iterations": ITERATIONS,
                               "hash": _hash(password, salt).hex()}))
    os.chmod(tmp, 0o600)
    os.replace(tmp, MFR_FILE)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "set-manufacturer":
        pw = getpass.getpass("New manufacturer password: ")
        if pw != getpass.getpass("Repeat password: "):
            sys.exit("Passwords don't match")
        set_manufacturer(sys.argv[2], pw)
        print(f"Manufacturer login saved for {sys.argv[2]!r} in {MFR_FILE}")
    else:
        print(__doc__)
        sys.exit(2)
