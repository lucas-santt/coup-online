# src/backend/errors.py

from enum import StrEnum

from fastapi import HTTPException


class ErrorCode(StrEnum):
    # auth
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    USERNAME_TAKEN = "USERNAME_TAKEN"
    USERNAME_INVALID = "USERNAME_INVALID"
    PASSWORD_TOO_SHORT = "PASSWORD_TOO_SHORT"
    PASSWORDS_DONT_MATCH = "PASSWORDS_DONT_MATCH"

    # matches
    MATCH_NOT_FOUND = "MATCH_NOT_FOUND"
    MATCH_FULL = "MATCH_FULL"
    WRONG_PASSWORD = "WRONG_PASSWORD"
    ALREADY_IN_MATCH = "ALREADY_IN_MATCH"

    # generic fallback
    UNKNOWN_ERROR = "UNKNOWN_ERROR"


def api_error(status_code: int, error_code: ErrorCode, detail: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"error_code": error_code, "detail": detail},
    )