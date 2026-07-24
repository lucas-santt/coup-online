from pathlib import Path
from backend.constants import ASSETS_DIR


class Settings:
	avatar_upload_dir: Path = ASSETS_DIR / "img" / "avatars" / "uploads"


settings = Settings()