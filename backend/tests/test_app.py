from fastapi import APIRouter
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.errors import AppError, install_error_handlers


def test_unknown_route_returns_error_shape(client: TestClient) -> None:
    r = client.get("/api/v1/does-not-exist")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "NOT_FOUND", "message": "Not Found"}}


def _app_with_test_routes() -> TestClient:
    from fastapi import FastAPI

    class Body(BaseModel):
        name: str
        count: int

    app = FastAPI()
    install_error_handlers(app)
    router = APIRouter()

    @router.post("/echo")
    def echo(body: Body) -> Body:
        return body

    @router.get("/boom")
    def boom() -> None:
        raise RuntimeError("secret internals")

    @router.get("/app-error")
    def app_error() -> None:
        raise AppError(409, "TURN_IN_PROGRESS", "busy")

    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


def test_invalid_body_maps_to_400() -> None:
    c = _app_with_test_routes()
    r = c.post("/echo", json={"name": "x", "count": "not-a-number"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    r = c.post("/echo", content=b"{not json", headers={"content-type": "application/json"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_unhandled_exception_maps_to_500_without_details() -> None:
    c = _app_with_test_routes()
    r = c.get("/boom")
    assert r.status_code == 500
    assert r.json() == {"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}}
    assert "secret" not in r.text


def test_app_error_shape() -> None:
    r = _app_with_test_routes().get("/app-error")
    assert r.status_code == 409
    assert r.json() == {"error": {"code": "TURN_IN_PROGRESS", "message": "busy"}}
