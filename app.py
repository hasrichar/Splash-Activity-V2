import os
import re
import time
import certifi
import mimetypes
from datetime import datetime
from bson.objectid import ObjectId
from flask import Flask, render_template, request, jsonify, Response, abort, url_for
from werkzeug.utils import secure_filename
from pymongo import MongoClient, DESCENDING, ASCENDING
from config import Config

os.makedirs(Config.MP3_FOLDER, exist_ok=True)

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config.from_object(Config)

# =========================================================
# 1. KONEKSI MONGODB ATLAS (DATABASE: splash_activity)
# =========================================================
try:
    mongo_client = MongoClient(
        Config.get_mongo_uri(),
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=5000
    )
    mongo_client.admin.command("ping")
    db = mongo_client[Config.MONGO_DB_NAME]

    db.tracks.create_index([("filename", ASCENDING)], unique=True)
    db.transactions.create_index([("timestamp", DESCENDING)])
    print(f"[MONGODB OK] Terhubung ke database '{Config.MONGO_DB_NAME}' di Cluster0!")
except Exception as e:
    safe_err = re.sub(r"://([^:]+):([^@]+)@", r"://\1:********@", str(e))
    raise RuntimeError(f"[MONGODB ERROR] Gagal terhubung: {safe_err}")


# =========================================================
# 2. SINKRONISASI FOLDER music KE KOLEKSI tracks
# =========================================================
def sync_static_mp3_to_mongodb():
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
                title = os.path.splitext(fname)[0].replace("_", " ")
                mime = "audio/mp4" if ext in {".m4a", ".aac"} else "audio/mpeg"

                db.tracks.update_one(
                    {"filename": fname},
                    {"$set": {
                        "title": title,
                        "filename": fname,
                        "size_mb": size_mb,
                        "size_bytes": size_bytes,
                        "mime": mime,
                        "source_type": "LOCAL",
                        "external_url": "",
                        "updated_at": int(time.time() * 1000)
                    }},
                    upsert=True
                )
                synced_details.append({
                    "filename": fname,
                    "size_mb": size_mb,
                    "size_bytes": size_bytes
                })

    removed_files = []
    for doc in db.tracks.find({"source_type": "LOCAL"}):
        if doc["filename"] not in found_files:
            db.tracks.delete_one({"_id": doc["_id"]})
            removed_files.append(doc["filename"])

    return {
        "scanned_count": len(synced_details),
        "removed_count": len(removed_files),
        "files": synced_details
    }


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
        "size_mb": doc.get("size_mb", 0.0),
        "size_bytes": doc.get("size_bytes", 0),
        "mime": doc.get("mime", "audio/mpeg"),
        "source_type": doc.get("source_type", "LOCAL"),
        "external_url": doc.get("external_url", ""),
        "stream_url": stream_url
    }


# =========================================================
# 3. ROUTE UTAMA & STREAMING HTTP 206 (UNTUK FILE 100MB+)
# =========================================================
@app.route("/")
def index():
    sync_static_mp3_to_mongodb()
    return render_template("index.html")


@app.route("/stream/<path:filename>")
def stream_audio(filename):
    safe_path = os.path.join(Config.MP3_FOLDER, filename)
    if not os.path.isfile(safe_path):
        abort(404, description="File audio tidak ditemukan di music.")

    file_size = os.path.getsize(safe_path)
    ext = os.path.splitext(filename)[1].lower()
    mime_type = "audio/mp4" if ext in {".m4a", ".aac"} else (mimetypes.guess_type(safe_path)[0] or "audio/mpeg")

    range_header = request.headers.get("Range", None)
    byte_start = 0
    byte_end = file_size - 1

    if range_header:
        match = re.search(r"bytes=(\d+)-(\d*)", range_header)
        if match:
            byte_start = int(match.group(1))
            if match.group(2):
                byte_end = min(int(match.group(2)), file_size - 1)

    if byte_start >= file_size or byte_start > byte_end:
        resp = Response(status=416)
        resp.headers["Content-Range"] = f"bytes */{file_size}"
        return resp

    content_length = (byte_end - byte_start) + 1

    def generate_chunks():
        chunk_size = 64 * 1024
        with open(safe_path, "rb") as f:
            f.seek(byte_start)
            remaining = content_length
            while remaining > 0:
                data = f.read(min(chunk_size, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    status_code = 206 if range_header else 200
    resp = Response(generate_chunks(), status=status_code, mimetype=mime_type, direct_passthrough=True)
    resp.headers["Content-Range"] = f"bytes {byte_start}-{byte_end}/{file_size}"
    resp.headers["Accept-Ranges"] = "bytes"
    resp.headers["Content-Length"] = str(content_length)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


# =========================================================
# 4. REST API MONGODB: TRACKS & TRANSACTIONS
# =========================================================
@app.route("/api/tracks", methods=["GET"])
def api_get_tracks():
    docs = db.tracks.find().sort("title", ASCENDING)
    return jsonify({"status": "OK", "engine": "MONGODB", "tracks": [serialize_track(d) for d in docs]})


@app.route("/api/tracks/scan", methods=["POST"])
def api_scan_tracks():
    report = sync_static_mp3_to_mongodb()
    docs = db.tracks.find().sort("title", ASCENDING)
    return jsonify({"status": "OK", "engine": "MONGODB", "scan_report": report, "tracks": [serialize_track(d) for d in docs]})


@app.route("/api/tracks/upload", methods=["POST"])
def api_upload_track():
    if "file" not in request.files:
        return jsonify({"status": "ERR", "message": "File tidak ditemukan."}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"status": "ERR", "message": "Nama file kosong."}), 400

    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in Config.ALLOWED_EXT:
        return jsonify({"status": "ERR", "message": f"Format {ext} tidak didukung."}), 400

    safe_name = secure_filename(f.filename)
    f.save(os.path.join(Config.MP3_FOLDER, safe_name))
    report = sync_static_mp3_to_mongodb()
    return jsonify({"status": "OK", "filename": safe_name, "scan_report": report})


@app.route("/api/tracks/cloud", methods=["POST"])
def api_add_cloud_track():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    url = (data.get("url") or "").strip()
    size_mb = round(float(data.get("size_mb") or 100.0), 2)
    if not title or not url:
        return jsonify({"status": "ERR", "message": "Judul dan URL Cloud wajib diisi."}), 400

    fname = f"cloud_{int(time.time())}_{secure_filename(title)}.mp3"
    db.tracks.update_one(
        {"filename": fname},
        {"$set": {
            "title": title,
            "filename": fname,
            "size_mb": size_mb,
            "size_bytes": int(size_mb * 1024 * 1024),
            "mime": "audio/mpeg",
            "source_type": "CLOUD",
            "external_url": url,
            "updated_at": int(time.time() * 1000)
        }},
        upsert=True
    )
    return jsonify({"status": "OK", "title": title})


@app.route("/api/tracks/<path:filename>", methods=["DELETE"])
def api_delete_track(filename):
    fpath = os.path.join(Config.MP3_FOLDER, filename)
    if os.path.isfile(fpath):
        os.remove(fpath)
    db.tracks.delete_one({"filename": filename})
    return jsonify({"status": "OK", "deleted": filename})


@app.route("/api/transactions", methods=["GET", "POST"])
def api_transactions():
    if request.method == "GET":
        docs = db.transactions.find().sort("timestamp", DESCENDING)
        items = [{
            "id": str(d["_id"]),
            "type": d.get("type", "OUT"),
            "category": d.get("category", "Lainnya"),
            "amount": int(d.get("amount", 0)),
            "note": d.get("note", ""),
            "date": d.get("date", ""),
            "timestamp": int(d.get("timestamp", 0))
        } for d in docs]
        return jsonify({"status": "OK", "engine": "MONGODB", "transactions": items})

    data = request.get_json(silent=True) or {}
    amount = int(data.get("amount", 0))
    if amount <= 0:
        return jsonify({"status": "ERR", "message": "Nominal harus lebih dari 0."}), 400

    doc = {
        "type": data.get("type", "OUT"),
        "category": data.get("category", "Lainnya"),
        "amount": amount,
        "note": (data.get("note") or data.get("category", "Transaksi")).strip(),
        "date": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "timestamp": int(time.time() * 1000)
    }
    res = db.transactions.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return jsonify({"status": "OK", "transaction": doc})


@app.route("/api/transactions/<tx_id>", methods=["DELETE"])
def api_delete_tx(tx_id):
    db.transactions.delete_one({"_id": ObjectId(str(tx_id))})
    return jsonify({"status": "OK", "deleted": tx_id})


@app.route("/api/diagnostics", methods=["GET"])
def api_diagnostics():
    docs = list(db.tracks.find())
    total_bytes = sum(int(t.get("size_bytes", 0)) for t in docs)
    missing = [
        t["filename"] for t in docs
        if t.get("source_type") == "LOCAL" and (
            not os.path.isfile(os.path.join(Config.MP3_FOLDER, t["filename"]))
            or os.path.getsize(os.path.join(Config.MP3_FOLDER, t["filename"])) == 0
        )
    ]
    return jsonify({
        "status": "OK",
        "server": "Flask 3.0 + MongoDB Atlas (Cluster0)",
        "db_engine": f"MONGODB ({Config.MONGO_DB_NAME})",
        "db_fallback_reason": None,
        "mp3_folder": "music/",
        "track_count": len(docs),
        "total_audio_mb": round(total_bytes / (1024 * 1024), 2),
        "corrupt_or_missing": missing
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=Config.PORT, threaded=True, debug=True)