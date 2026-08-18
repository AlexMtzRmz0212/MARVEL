from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Response, status

from app.api.deps import CurrentUserDep, DbDep
from app.core.config import get_settings
from app.core.security import COOKIE_NAME, create_access_token, verify_password
from app.schemas.auth import (
    DeleteAccountRequest,
    LoginRequest,
    RegisterRequest,
    UserOut,
)
from app.services.accounts import (
    EmailTakenError,
    authenticate,
    create_user,
    delete_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, user_id: uuid.UUID) -> None:
    """Issue the session cookie.

    HttpOnly because no script has any reason to read it, and keeping it out of
    JS removes XSS token theft entirely.

    SameSite=Lax rather than Strict: Strict would drop the cookie when someone
    follows a shared link into the app, so they would land signed out for no
    security gain here. The API only accepts JSON bodies and lives on the same
    origin as the SPA, so a cross-site form post -- which cannot set
    Content-Type: application/json -- has nothing to submit to.
    """
    settings = get_settings()
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_access_token(user_id),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, db: DbDep) -> UserOut:
    """Create an account and sign straight in.

    Setting the cookie here rather than making the client follow up with a login
    is what lets the first-run merge prompt fire immediately after registering,
    which is the case where a guest has local data to bring along.
    """
    try:
        user = create_user(
            db,
            email=payload.email,
            password=payload.password,
            display_name=payload.display_name,
        )
    except EmailTakenError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists.",
        ) from None

    _set_session_cookie(response, user.id)
    return UserOut.model_validate(user)


@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response, db: DbDep) -> UserOut:
    user = authenticate(db, email=payload.email, password=payload.password)
    if user is None:
        # One message for both "no such account" and "wrong password": telling
        # them apart turns the endpoint into an account-existence oracle.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    _set_session_cookie(response, user.id)
    return UserOut.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    _clear_session_cookie(response)


def _clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    # The attributes have to mirror _set_session_cookie exactly. A deletion that
    # differs in path, samesite or secure is treated as targeting a different
    # cookie and silently leaves the session in place.
    response.delete_cookie(
        key=COOKIE_NAME,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    payload: DeleteAccountRequest,
    response: Response,
    user: CurrentUserDep,
    db: DbDep,
) -> None:
    """Erase the account and every row belonging to it.

    This is what makes the deletion clause of the privacy policy true: there is
    no soft delete and no retention window, and `is_active = false` deliberately
    is not used, because a deactivated row still holds the address and the
    display name.

    The session cookie is cleared in the same response, so the SPA cannot be
    left holding a token for a user id that no longer resolves.
    """
    ok, _ = verify_password(payload.password, user.hashed_password)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="That password is not correct.",
        )

    delete_user(db, user)
    _clear_session_cookie(response)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUserDep) -> UserOut:
    """401 when signed out, which is the answer the SPA boots on.

    The frontend's unauthorized handler is guarded against exactly this, so a
    guest's 401 here is an answer rather than an error.
    """
    return UserOut.model_validate(user)
