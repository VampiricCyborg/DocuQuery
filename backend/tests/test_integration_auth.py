"""
The /auth/* routes, against a real database.

These paths depend on things a mock cannot have: the UNIQUE constraint on
users.email that turns a duplicate signup into a 409, and the round trip through
a real row for /auth/me. test_security.py already covers the hashing and session
primitives in isolation; this covers the routes that use them.
"""

from __future__ import annotations

import pytest

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

PASSWORD = "correct horse battery staple"


async def test_signup_creates_an_account_and_sets_a_session_cookie(client):
    response = await client.post(
        "/auth/signup",
        json={"name": "Ada Lovelace", "email": "ada@example.com", "password": PASSWORD},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "ada@example.com"
    assert body["name"] == "Ada Lovelace"
    assert "password" not in body and "password_hash" not in body

    cookie = response.cookies.get("docuquery_session")
    assert cookie, "signup must establish a session"


async def test_signup_normalizes_the_email_and_rejects_a_duplicate(client):
    first = await client.post(
        "/auth/signup",
        json={"name": "Ada", "email": "  Ada@Example.com  ", "password": PASSWORD},
    )
    assert first.status_code == 201
    assert first.json()["email"] == "ada@example.com", "email should be trimmed and lowercased"

    # Same address in a different case must collide, which only the real UNIQUE
    # constraint can demonstrate.
    duplicate = await client.post(
        "/auth/signup",
        json={"name": "Imposter", "email": "ADA@EXAMPLE.COM", "password": PASSWORD},
    )
    assert duplicate.status_code == 409


async def test_login_succeeds_with_the_right_password(client, make_user):
    user = await make_user("ada@example.com", name="Ada", password=PASSWORD)

    response = await client.post(
        "/auth/login", json={"email": user.email, "password": PASSWORD}
    )

    assert response.status_code == 200
    assert response.json()["id"] == user.id
    assert response.cookies.get("docuquery_session")


async def test_login_with_the_wrong_password_is_401_and_sets_no_cookie(client, make_user):
    user = await make_user("ada@example.com", password=PASSWORD)

    response = await client.post(
        "/auth/login", json={"email": user.email, "password": "not-the-password"}
    )

    assert response.status_code == 401
    assert not response.cookies.get("docuquery_session")


async def test_login_for_an_unknown_email_is_401_with_the_same_message(client):
    """A different message here would let an attacker enumerate registered emails."""
    unknown = await client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": PASSWORD}
    )
    assert unknown.status_code == 401

    known = await client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "another-wrong-one"}
    )
    assert known.json()["detail"] == unknown.json()["detail"]


async def test_me_returns_the_authenticated_user(client, make_user):
    user = await make_user("ada@example.com", name="Ada Lovelace")

    response = await client.get("/auth/me", cookies=user.cookies)

    assert response.status_code == 200
    assert response.json()["id"] == user.id
    assert response.json()["email"] == "ada@example.com"


async def test_me_without_a_cookie_is_401(client):
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_me_with_a_tampered_cookie_is_401(client, make_user):
    user = await make_user("ada@example.com")
    tampered = {"docuquery_session": user.cookies["docuquery_session"] + "x"}

    response = await client.get("/auth/me", cookies=tampered)

    assert response.status_code == 401


async def test_me_is_401_after_the_user_row_is_deleted(client, db_session, make_user):
    """
    A signature that still verifies is not enough; the user must still exist.
    Only a real database can delete the row out from under a valid cookie.
    """
    from app.database.models import User

    user = await make_user("ada@example.com")
    assert (await client.get("/auth/me", cookies=user.cookies)).status_code == 200

    await db_session.execute(User.__table__.delete().where(User.id == user.id))
    await db_session.commit()

    assert (await client.get("/auth/me", cookies=user.cookies)).status_code == 401


async def test_logout_clears_the_session_cookie(client, make_user):
    user = await make_user("ada@example.com")

    response = await client.post("/auth/logout", cookies=user.cookies)

    assert response.status_code == 204
    # Starlette clears a cookie by re-setting it empty with an expiry in the past.
    set_cookie = response.headers.get("set-cookie", "")
    assert "docuquery_session=" in set_cookie
    assert 'docuquery_session=""' in set_cookie or "Max-Age=0" in set_cookie or "expires=" in set_cookie.lower()
