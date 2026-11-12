import os
import re
import time
import certifi
from flask import url_for
from pymongo import MongoClient, DESCENDING, ASCENDING
from config import Config

try:
    os.makedirs(Config.MP3_FOLDER, exist_ok=True)
    os.makedirs(Config.COVERS_FOLDER, exist_ok=True)
except OSError:
    pass

try:
    mongo_client = MongoClient(
        Config.get_mongo_uri(),
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=5000
    )
    mongo_client.admin.command("ping")
    db = mongo_client[Config.MONGO_DB_NAME]

    db.tracks.create_index([("filename", ASCENDING)], unique=True)
    db.tracks.create_index([("album", ASCENDING)])
    db.albums.create_index([("name", ASCENDING)], unique=True)
    db.transactions.create_index([("timestamp", DESCENDING)])
    print(f"[MONGODB OK] Terhubung ke database '{Config.MONGO_DB_NAME}'!")
except Exception as e:
    safe_err = re.sub(r"://([^:]+):([^@]+)@", r"://\1:********@", str(e))
    raise RuntimeError(f"[MONGODB ERROR] Gagal terhubung: {safe_err}")


def sync_music_folder():
    """Memindai folder music/ tanpa menimpa album & gambar sampul yang sudah diatur."""
    found_files = set()
    synced_details = []

    if os.path.exists(Config.MP3_FOLDER):
        for fname in sorted(os.listdir(Config.MP3_FOLDER)):
            fpath = os.path.join(Config.MP3_FOLDER, fname)
            if not os.path.isfile(fpath):
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext in Config.ALLOWED_EXT:
                found_files.add(fname)
                size_bytes = os.path.getsize(fpath)
                size_mb = round(size_bytes / (1024 * 1024), 2)
                default_title = os.path.splitext(fname)[0].replace("_", " ")
                mime = "audio/mp4" if ext in {".m4a", ".aac"} else "audio/mpeg"

                db.tracks.update_one(
                    {"filename": fname},
                    {
                        "$set": {
                            "filename": fname,
                            "size_mb": size_mb,
                            "size_bytes": size_bytes,
                            "mime": mime,
                            "source_type": "LOCAL",
                            "updated_at": int(time.time() * 1000)
                        },
                        "$setOnInsert": {
                            "title": default_title,
                            "album": "",
                            "cover_url": "",
                            "external_url": ""
                        }
                    },
                    upsert=True
                )
                synced_details.append({"filename": fname, "size_mb": size_mb, "size_bytes": size_bytes})

    removed_files = []
    for doc in db.tracks.find({"source_type": "LOCAL"}):
        if doc["filename"] not in found_files:
            db.tracks.delete_one({"_id": doc["_id"]})
            removed_files.append(doc["filename"])

    return {"scanned_count": len(synced_details), "removed_count": len(removed_files), "files": synced_details}


def serialize_track(doc):
    stream_url = (
        doc.get("external_url")
        if doc.get("source_type") == "CLOUD"
        else url_for("stream_audio", filename=doc["filename"])
    )
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "filename": doc.get("filename", ""),
        "album": doc.get("album", ""),
        "cover_url": doc.get("cover_url", ""),
        "size_mb": doc.get("size_mb", 0.0),
        "size_bytes": doc.get("size_bytes", 0),
        "mime": doc.get("mime", "audio/mpeg"),
        "source_type": doc.get("source_type", "LOCAL"),
        "external_url": doc.get("external_url", ""),
        "stream_url": stream_url
    }


def serialize_album(doc, track_count=0):
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "cover_url": doc.get("cover_url", ""),
        "track_count": track_count
    }