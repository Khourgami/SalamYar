import jwt
import pytest
from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth.deps import require_admin
from app.auth.security import create_access_token, decode_access_token
from app.cli import main as cli_main
from app.errors import install_error_handlers
from app.services.user_service import UserError, create_user
from tests.helpers import PASSWORD, auth_headers, make_user


def test_login_success(client: TestClient) -> None:
    user = make_user()
    r = client.post("/api/v1/auth/login", json={"username": "dr.a", "password": PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["user"] == {
        "id": user.id,
        "username": "dr.a",
        "display_name": "Dr dr.a",
        "role": "evaluator",
    }
    payload = decode_access_token(body["access_token"])
    assert payload["sub"] == user.id
    assert payload["role"] == "evaluator"


@pytest.mark.parametrize("username,password", [("dr.a", "wrong-password"), ("nobody", PASSWORD)])
def test_login_failure(client: TestClient, username: str, password: str) -> None:
    make_user()
    r = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHORIZED"


def test_login_invalid_body(client: TestClient) -> None:
    r = client.post("/api/v1/auth/login", json={"username": "x"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_me_valid_token(client: TestClient) -> None:
    user = make_user()
    r = client.get("/api/v1/auth/me", headers=auth_headers(user))
    assert r.status_code == 200
    assert r.json()["id"] == user.id


def test_me_missing_token(client: TestClient) -> None:
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHORIZED"


def test_me_expired_token(client: TestClient) -> None:
    user = make_user()
    token = create_access_token(user.id, user.role, expires_hours=-1)
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHORIZED"


def test_me_tampered_token(client: TestClient) -> None:
    user = make_user()
    token = create_access_token(user.id, user.role)
    forged = jwt.encode(
        {"sub": user.id, "role": "admin", "exp": 9999999999},
        "another-secret-that-is-also-long-enough",
    )
    header, _, sig = token.split(".")
    tampered = f"{header}.{forged.split('.')[1]}.{sig}"
    for bad in (forged, tampered, "not-a-jwt"):
        r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bad}"})
        assert r.status_code == 401, bad


def test_me_unknown_user(client: TestClient) -> None:
    token = create_access_token("00000000-0000-0000-0000-000000000000", "admin")
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_require_admin() -> None:
    app = FastAPI()
    install_error_handlers(app)
    router = APIRouter()

    @router.get("/admin-only")
    def admin_only(_: object = Depends(require_admin)) -> dict[str, bool]:
        return {"ok": True}

    app.include_router(router)
    c = TestClient(app)
    evaluator = make_user("ev")
    admin = make_user("ad", role="admin")
    r = c.get("/admin-only", headers=auth_headers(evaluator))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"
    assert c.get("/admin-only", headers=auth_headers(admin)).json() == {"ok": True}


def test_create_user_rules(db) -> None:  # type: ignore[no-untyped-def]
    create_user(db, username="u1", display_name="U", password="12345678", role="evaluator")
    with pytest.raises(UserError, match="already exists"):
        create_user(db, username="u1", display_name="U", password="12345678", role="evaluator")
    with pytest.raises(UserError, match="at least 8"):
        create_user(db, username="u2", display_name="U", password="short", role="evaluator")
    with pytest.raises(UserError, match="role"):
        create_user(db, username="u3", display_name="U", password="12345678", role="root")  # type: ignore[arg-type]


def test_cli_create_user(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture) -> None:
    monkeypatch.setattr("getpass.getpass", lambda _prompt="": "long-password")
    assert (
        cli_main(["create-user", "--username", "v", "--display-name", "V", "--role", "admin"]) == 0
    )
    assert "created admin 'v'" in capsys.readouterr().out
    # duplicate is refused
    assert (
        cli_main(["create-user", "--username", "v", "--display-name", "V", "--role", "admin"]) == 1
    )
    assert "already exists" in capsys.readouterr().err


def test_cli_rejects_short_password(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
) -> None:
    monkeypatch.setattr("getpass.getpass", lambda _prompt="": "short")
    rc = cli_main(["create-user", "--username", "w", "--display-name", "W", "--role", "evaluator"])
    assert rc == 1
    assert "at least 8" in capsys.readouterr().err
