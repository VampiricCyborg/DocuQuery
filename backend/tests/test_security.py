import pytest

from app.core.config import DEV_AUTH_SECRET, Settings
from app.core.security import create_session, hash_password, read_session, verify_password


def test_password_hash_is_not_reversible_and_verifies():
    encoded = hash_password("correct horse battery staple")
    assert encoded != "correct horse battery staple"
    assert verify_password("correct horse battery staple", encoded)
    assert not verify_password("wrong password", encoded)


def test_session_round_trip_and_tamper_rejection():
    token = create_session("user-123")
    assert read_session(token) == "user-123"
    assert read_session(token + "tampered") is None


@pytest.mark.parametrize("secret", [DEV_AUTH_SECRET, "", "   "])
def test_production_settings_reject_a_guessable_auth_secret(secret):
    """A non-debug build must not start with a session key anyone could know."""
    with pytest.raises(ValueError, match="AUTH_SECRET"):
        Settings(debug=False, auth_secret=secret)


def test_production_settings_accept_a_real_auth_secret():
    assert Settings(debug=False, auth_secret="s3kr1t-from-the-deploy-env").auth_secret


def test_debug_settings_still_work_without_an_auth_secret():
    """Local development should need no setup, so debug builds keep the default."""
    assert Settings(debug=True, auth_secret=DEV_AUTH_SECRET).auth_secret == DEV_AUTH_SECRET
