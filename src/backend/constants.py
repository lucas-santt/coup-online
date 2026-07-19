from pathlib import Path


SRC_DIR: Path = Path(__file__).resolve().parent.parent
STATIC_DIR: Path = SRC_DIR / "static"
PAGES_DIR: Path = STATIC_DIR / "pages"
ASSETS_DIR: Path = STATIC_DIR / "assets"

DEFAULT_AVATAR_PATH: Path = STATIC_DIR / "default-avatar.png"

USERNAME_MIN_LENGTH: int = 3
USERNAME_MAX_LENGTH: int = 32

PASSWORD_MIN_LENGTH: int = 8
PASSWORD_MAX_LENGTH: int = 256
