import os
import re
import time
import mimetypes
from datetime import datetime
from bson.objectid import ObjectId
from flask import Flask, render_template, request, jsonify, Response, abort, url_for
from werkzeug.utils import secure_filename
from pymongo import DESCENDING, ASCENDING
from config import Config
from database import db, sync_music_folder, serialize_track, serialize_album
import base64

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config.from_object(Config)


import base64

def _save_cover_file(file_obj):
    if file_obj and file_obj.filename != '':
        encoded_string = base64.b64encode(file_obj.read()).decode('utf-8')
        mime_type = file_obj.content_type or 'image/jpeg'
        return f"data:{mime_type};base64,{encoded_string}"
    return ""


def _ensure_album_exists(album_name, cover_url=""):
    """Memastikan nama album tercatat di koleksi db.albums."""
    clean_name = (album_name or "").strip()
    if not clean_name:
        return
    update_doc = {"$setOnInsert": {"name": clean_name, "created_at": int(time.time() * 1000)}}
    if cover_url:
        update_doc["$set"] = {"cover_url": cover_url}
    else:
        update_doc["$setOnInsert"]["cover_url"] = ""
    db.albums.update_one({"name": clean_name}, update_doc, upsert=True)


# =========================================================
# 1. RUTE HALAMAN WEB TERPISAH
# =========================================================
@app.route("/")
def page_music():
    sync_music_folder()
    track_count = db.tracks.count_documents({})
    return render_template("music.html", active_page="music", page_title="Music Player", track_count=track_count)


@app.route("/finance")
def page_finance():
    track_count = db.tracks.count_documents({})
    return render_template("finance.html", active_page="finance", page_title="Finance Vault", track_count=track_count)


@app.route("/sync")
def page_sync():
    track_count = db.tracks.count_documents({})
    return render_template("sync.html", active_page="sync", page_title="Integrations", track_count=track_count)


# =========================================================
# 2. MESIN HTTP 206 BYTE-RANGE STREAMING
# =========================================================
@app.route("/stream/<path:filename>")
def stream_audio(filename):
    safe_path = os.path.join(Config.MP3_FOLDER, filename)
    if not os.path.isfile(safe_path):
        abort(404)

    file_size = os.path.getsize(safe_path)
    ext = os.path.splitext(filename)[1].lower()
    mime_type = "audio/mp4" if ext in {".m4a", ".aac"} else (mimetypes.guess_type(safe_path)[0] or "audio/mpeg")

    range_header = request.headers.get("Range", None)
    byte_start, byte_end = 0, file_size - 1

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

    resp = Response(generate_chunks(), status=(206 if range_header else 200), mimetype=mime_type, direct_passthrough=True)
    resp.headers["Content-Range"] = f"bytes {byte_start}-{byte_end}/{file_size}"
    resp.headers["Accept-Ranges"] = "bytes"
    resp.headers["Content-Length"] = str(content_length)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


# =========================================================
# 3. REST API MANAJEMEN ALBUM (BUAT, HAPUS, & PINDAH LAGU)
# =========================================================
@app.route("/api/albums", methods=["GET"])
def api_get_albums():
    # Sinkronkan nama album yang mungkin sudah ada di koleksi tracks
    distinct_track_albums = db.tracks.distinct("album")
    for alb_name in distinct_track_albums:
        if alb_name and alb_name.strip():
            _ensure_album_exists(alb_name.strip())

    album_docs = list(db.albums.find().sort("name", ASCENDING))
    result = []
    for d in album_docs:
        cnt = db.tracks.count_documents({"album": d["name"]})
        result.append(serialize_album(d, track_count=cnt))
    return jsonify({"status": "OK", "albums": result})


@app.route("/api/albums", methods=["POST"])
def api_create_album():
    name = (request.form.get("name") or "").strip()
    if not name:
        return jsonify({"status": "ERR", "message": "Nama album wajib diisi."}), 400

    cover_saved = _save_cover_file(request.files.get("cover_file"))
    cover_url = cover_saved or (request.form.get("cover_url") or "").strip()

    _ensure_album_exists(name, cover_url)
    doc = db.albums.find_one({"name": name})
    cnt = db.tracks.count_documents({"album": name})
    return jsonify({"status": "OK", "album": serialize_album(doc, track_count=cnt)})


@app.route("/api/albums/<album_id>", methods=["DELETE"])
def api_delete_album(album_id):
    doc = db.albums.find_one({"_id": ObjectId(str(album_id))})
    if not doc:
        return jsonify({"status": "ERR", "message": "Album tidak ditemukan."}), 404

    album_name = doc.get("name", "")
    # Lagu di dalam album ini tidak dihapus, melainkan diletakkan kembali di luar album
    db.tracks.update_many({"album": album_name}, {"$set": {"album": ""}})
    db.albums.delete_one({"_id": doc["_id"]})
    return jsonify({"status": "OK", "deleted_album": album_name})


# =========================================================
# 4. REST API LAGU (TRACKS)
# =========================================================
@app.route("/api/tracks", methods=["GET"])
def api_get_tracks():
    docs = db.tracks.find().sort("title", ASCENDING)
    return jsonify({"status": "OK", "engine": "MONGODB", "tracks": [serialize_track(d) for d in docs]})


@app.route("/api/tracks/scan", methods=["POST"])
def api_scan_tracks():
    report = sync_music_folder()
    docs = db.tracks.find().sort("title", ASCENDING)
    return jsonify({"status": "OK", "engine": "MONGODB", "scan_report": report, "tracks": [serialize_track(d) for d in docs]})


@app.route("/api/tracks/meta", methods=["POST"])
def api_update_track_meta():
    filename = (request.form.get("filename") or "").strip()
    if not filename:
        return jsonify({"status": "ERR", "message": "Filename wajib diisi."}), 400

    doc = db.tracks.find_one({"filename": filename})
    if not doc:
        return jsonify({"status": "ERR", "message": "Lagu tidak ditemukan."}), 404

    new_title = (request.form.get("title") or doc.get("title", "")).strip()
    new_album = (request.form.get("album") or "").strip()
    cover_url_input = (request.form.get("cover_url") or "").strip()

    if new_album:
        _ensure_album_exists(new_album)

    update_fields = {
        "title": new_title,
        "album": new_album,
        "updated_at": int(time.time() * 1000)
    }

    if "cover_file" in request.files and request.files["cover_file"].filename:
        saved_cover = _save_cover_file(request.files["cover_file"])
        if saved_cover:
            update_fields["cover_url"] = saved_cover
    elif cover_url_input:
        update_fields["cover_url"] = cover_url_input
    elif request.form.get("clear_cover") == "1":
        update_fields["cover_url"] = ""

    db.tracks.update_one({"filename": filename}, {"$set": update_fields})
    updated_doc = db.tracks.find_one({"filename": filename})
    return jsonify({"status": "OK", "track": serialize_track(updated_doc)})


@app.route("/api/tracks/upload", methods=["POST"])
def api_upload_track():
    if "file" not in request.files or not request.files["file"].filename:
        return jsonify({"status": "ERR", "message": "File audio kosong."}), 400
    f = request.files["file"]
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in Config.ALLOWED_EXT:
        return jsonify({"status": "ERR", "message": f"Ekstensi {ext} tidak didukung."}), 400

    safe_name = secure_filename(f.filename)
    f.save(os.path.join(Config.MP3_FOLDER, safe_name))
    report = sync_music_folder()

    album_name = (request.form.get("album") or "").strip()
    cover_saved = _save_cover_file(request.files.get("cover_file"))
    extra_set = {}
    if album_name:
        _ensure_album_exists(album_name)
        extra_set["album"] = album_name
    if cover_saved:
        extra_set["cover_url"] = cover_saved
    if extra_set:
        db.tracks.update_one({"filename": safe_name}, {"$set": extra_set})

    return jsonify({"status": "OK", "filename": safe_name, "scan_report": report})


@app.route("/api/tracks/cloud", methods=["POST"])
def api_add_cloud_track():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    url = (data.get("url") or "").strip()
    album = (data.get("album") or "").strip()
    cover_url = (data.get("cover_url") or "").strip()
    size_mb = round(float(data.get("size_mb") or 100.0), 2)
    if not title or not url:
        return jsonify({"status": "ERR", "message": "Judul dan URL wajib diisi."}), 400

    if album:
        _ensure_album_exists(album)

    fname = f"cloud_{int(time.time())}_{secure_filename(title)}.mp3"
    db.tracks.update_one(
        {"filename": fname},
        {"$set": {
            "title": title, "filename": fname, "album": album, "cover_url": cover_url,
            "size_mb": size_mb, "size_bytes": int(size_mb * 1024 * 1024),
            "mime": "audio/mpeg", "source_type": "CLOUD", "external_url": url,
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


# =========================================================
# 5. REST API KEUANGAN & DIAGNOSTIK
# =========================================================
@app.route("/api/transactions", methods=["GET", "POST"])
def api_transactions():
    if request.method == "GET":
        docs = db.transactions.find().sort("timestamp", DESCENDING)
        items = [{
            "id": str(d["_id"]), "type": d.get("type", "OUT"),
            "category": d.get("category", "Lainnya"), "amount": float(d.get("amount", 0)),
            "note": d.get("note", ""), "date": d.get("date", ""), "timestamp": int(d.get("timestamp", 0))
        } for d in docs]
        return jsonify({"status": "OK", "engine": "MONGODB", "transactions": items})

    data = request.get_json(silent=True) or {}
    amount = float(data.get("amount", 0))
    if amount <= 0:
        return jsonify({"status": "ERR", "message": "Nominal harus > 0."}), 400

    # Simpan sebagai integer jika bulat, atau float jika ada desimal koma
    clean_amount = int(amount) if amount.is_integer() else round(amount, 2)

    doc = {
        "type": data.get("type", "OUT"),
        "category": data.get("category", "Lainnya"),
        "amount": clean_amount,
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
    album_cnt = db.albums.count_documents({})
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
        "server": "Flask Modular + MongoDB Atlas",
        "db_engine": f"MONGODB ({Config.MONGO_DB_NAME})",
        "track_count": len(docs),
        "album_count": album_cnt,
        "total_audio_mb": round(total_bytes / (1024 * 1024), 2),
        "corrupt_or_missing": missing
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=Config.PORT, threaded=True, debug=True)