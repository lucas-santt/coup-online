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

	# tribunal / lobby websocket
	MATCH_NOT_WAITING = "MATCH_NOT_WAITING"
	NOT_HOST = "NOT_HOST"
	NOT_ALL_READY = "NOT_ALL_READY"
	NOT_ENOUGH_PLAYERS = "NOT_ENOUGH_PLAYERS"
	SETTINGS_INVALID = "SETTINGS_INVALID"
	PING_ON_COOLDOWN = "PING_ON_COOLDOWN"
	NO_UNREADY_PLAYERS = "NO_UNREADY_PLAYERS"
	PLAYER_NOT_FOUND = "PLAYER_NOT_FOUND"
	CANNOT_TARGET_SELF = "CANNOT_TARGET_SELF"
	SETTINGS_ON_COOLDOWN = "SETTINGS_ON_COOLDOWN"

	# in-match websocket (see routers/websockets.py's in-match handlers)
	MATCH_NOT_IN_PROGRESS = "MATCH_NOT_IN_PROGRESS"
	INVALID_ACTION = "INVALID_ACTION"

	# generic fallback
	UNKNOWN_ERROR = "UNKNOWN_ERROR"


def api_error(status_code: int, error_code: ErrorCode, detail: str) -> HTTPException:
	return HTTPException(
		status_code=status_code,
		detail={"error_code": error_code, "detail": detail},
	)