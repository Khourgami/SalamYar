"""Shared API types (API_CONTRACT §2)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

Role = Literal["evaluator", "admin"]


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(ApiModel):
    id: str
    username: str
    display_name: str
    role: Role


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut
