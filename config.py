import os
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
_ROOT_MUSIC = os.path.join(BASE_DIR, "music")
_STATIC_MUSIC = os.path.join(BASE_DIR, "static", "music")


class Config:
    PORT = int(os.getenv("PORT", 5000))
    MONGO_DB_NAME = (os.getenv("MONGO_DB_NAME") or "splash_activity").strip()
    CLOUDINARY_CLOUD_NAME = (os.getenv("CLOUDINARY_CLOUD_NAME") or "p4yya3go").strip()
    CLOUDINARY_UPLOAD_PRESET = (os.getenv("CLOUDINARY_UPLOAD_PRESET") or "splash_audio").strip()
    MP3_FOLDER = _STATIC_MUSIC if (os.path.exists(_STATIC_MUSIC) and not os.path.exists(_ROOT_MUSIC)) else _ROOT_MUSIC
    COVERS_FOLDER = os.path.join(BASE_DIR, "static", "covers")

    ALLOWED_EXT = {".mp3", ".m4a", ".aac", ".wav", ".ogg"}
    ALLOWED_IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    MAX_CONTENT_LENGTH = 500 * 1024 * 1024  # Limit 500 MB

    @staticmethod
    def _get_raw_password():
        env_pass = os.getenv("MONGO_PASSWORD", "").strip()
        if env_pass:
            return env_pass
        secret_file = os.path.join(BASE_DIR, ".mongo_secret")
        if os.path.isfile(secret_file):
            with open(secret_file, "r", encoding="utf-8") as f:
                return f.read().strip()
        return ""

    @classmethod
    def get_mongo_uri(cls):
        uri_template = os.getenv("MONGO_URI", "").strip()
        raw_pass = cls._get_raw_password()
        safe_pass = quote_plus(raw_pass) if raw_pass else ""

        if uri_template:
            if "<password>" in uri_template or "<db_password>" in uri_template:
                if not safe_pass:
                    raise RuntimeError("MONGO_PASSWORD belum diisi di .env!")
                return uri_template.replace("<password>", safe_pass).replace("<db_password>", safe_pass)
            return uri_template

        raise RuntimeError("MONGO_URI belum diisi di dalam file .env!")