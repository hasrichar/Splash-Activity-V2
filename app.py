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
@app.route("/api/cloud-track", methods=["POST"])
def api_add_cloud_track():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    url = (data.get("url") or "").strip()
    album = (data.get("album") or "").strip()
    cover_url = (data.get("cover_url") or data.get("cover") or "").strip()
    try:
        size_mb = round(float(data.get("size_mb") or 0.0), 2)
    except (ValueError, TypeError):
        size_mb = 0.0

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
    return jsonify({"status": "OK", "ok": True, "title": title, "filename": fname})


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
            "id": str(d["_id"]),
            "type": d.get("type", "OUT"),
            "category": d.get("category", "Lainnya"),
            "amount": float(d.get("amount", 0)),
            "note": d.get("note", ""),
            "date": d.get("date", ""),
            "timestamp": int(d.get("timestamp", 0)),
            "account": d.get("account", "Rekening Bank"),
            "target_account": d.get("target_account", ""),
            "receipt_image": d.get("receipt_image", "")
        } for d in docs]
        return jsonify({"status": "OK", "engine": "MONGODB", "transactions": items})

    data = request.get_json(silent=True) or {}
    amount = float(data.get("amount", 0))
    if amount <= 0:
        return jsonify({"status": "ERR", "message": "Nominal harus > 0."}), 400

    clean_amount = int(amount) if amount.is_integer() else round(amount, 2)
    tx_type = (data.get("type") or "OUT").strip()
    category = (data.get("category") or "Lainnya").strip()
    if tx_type == "TRF":
        category = "Transfer Antar Rekening"

    account = (data.get("account") or "Rekening Bank").strip()
    target_account = (data.get("target_account") or "").strip()
    default_note = f"Transfer ke {target_account}" if tx_type == "TRF" and target_account else category

    doc = {
        "type": tx_type,
        "category": category,
        "amount": clean_amount,
        "note": (data.get("note") or default_note).strip(),
        "account": account,
        "target_account": target_account,
        "receipt_image": (data.get("receipt_image") or "").strip(),
        "date": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "timestamp": int(time.time() * 1000)
    }
    res = db.transactions.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return jsonify({"status": "OK", "transaction": doc})


@app.route("/api/transactions/<tx_id>", methods=["GET", "PUT", "DELETE"])
def api_tx_detail(tx_id):
    if request.method == "DELETE":
        db.transactions.delete_one({"_id": ObjectId(str(tx_id))})
        return jsonify({"status": "OK", "deleted": tx_id})

    doc = db.transactions.find_one({"_id": ObjectId(str(tx_id))})
    if not doc:
        return jsonify({"status": "ERR", "message": "Transaksi tidak ditemukan."}), 404

    if request.method == "GET":
        return jsonify({
            "status": "OK",
            "transaction": {
                "id": str(doc["_id"]),
                "type": doc.get("type", "OUT"),
                "category": doc.get("category", "Lainnya"),
                "amount": float(doc.get("amount", 0)),
                "note": doc.get("note", ""),
                "date": doc.get("date", ""),
                "account": doc.get("account", "Rekening Bank"),
                "target_account": doc.get("target_account", ""),
                "receipt_image": doc.get("receipt_image", "")
            }
        })

    data = request.get_json(silent=True) or {}
    upd = {}
    if "type" in data:
        upd["type"] = str(data["type"]).strip()
    if "category" in data:
        upd["category"] = str(data["category"]).strip()
    if "amount" in data and float(data["amount"]) > 0:
        amt = float(data["amount"])
        upd["amount"] = int(amt) if amt.is_integer() else round(amt, 2)
    if "note" in data:
        upd["note"] = str(data["note"]).strip()
    if "account" in data:
        upd["account"] = str(data["account"]).strip()
    if "target_account" in data:
        upd["target_account"] = str(data["target_account"]).strip()

    if upd:
        db.transactions.update_one({"_id": doc["_id"]}, {"$set": upd})

    return jsonify({"status": "OK", "id": tx_id})


@app.route("/api/transactions/export.csv", methods=["GET"])
def api_export_transactions_csv():
    docs = list(db.transactions.find().sort("timestamp", DESCENDING))
    import csv
    import io
    output = io.StringIO()
    # UTF-8 BOM so Microsoft Excel opens it seamlessly
    output.write("\ufeff")
    writer = csv.writer(output, delimiter=",", quoting=csv.QUOTE_MINIMAL)
    writer.writerow(["ID", "Tanggal", "Tipe", "Kategori", "Nominal (IDR)", "Rekening Sumber", "Rekening Tujuan", "Catatan", "Ada Struk"])
    for d in docs:
        writer.writerow([
            str(d["_id"]),
            d.get("date", ""),
            d.get("type", "OUT"),
            d.get("category", ""),
            f"{float(d.get('amount', 0)):.2f}",
            d.get("account", ""),
            d.get("target_account", ""),
            d.get("note", ""),
            "Ya" if d.get("receipt_image") else "Tidak"
        ])
    csv_data = output.getvalue()
    filename = f"transaksi_splash_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    return Response(
        csv_data,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.route("/api/accounts", methods=["GET", "POST"])
def api_accounts():
    if request.method == "GET":
        acc_docs = list(db.accounts.find().sort("name", ASCENDING))
        tx_docs = list(db.transactions.find())
        results = []

        acc_names = {a.get("name", "").strip() for a in acc_docs}

        # Transaksi unassigned (tanpa account atau belum terdaftar)
        unassigned_in = sum(float(t.get("amount", 0)) for t in tx_docs if t.get("type") == "IN" and (not t.get("account") or t.get("account").strip() not in acc_names))
        unassigned_out = sum(float(t.get("amount", 0)) for t in tx_docs if t.get("type") == "OUT" and (not t.get("account") or t.get("account").strip() not in acc_names))

        for idx, acc in enumerate(acc_docs):
            acc_name = acc.get("name", "").strip()
            init_bal = float(acc.get("initial_balance", 0))

            # Hitung mutasi reguler & transfer
            acc_in = sum(
                float(t.get("amount", 0)) for t in tx_docs
                if ((t.get("account") or "").strip() == acc_name and t.get("type") == "IN")
                or ((t.get("target_account") or "").strip() == acc_name and t.get("type") == "TRF")
            )
            acc_out = sum(
                float(t.get("amount", 0)) for t in tx_docs
                if (t.get("account") or "").strip() == acc_name and t.get("type") in ("OUT", "TRF")
            )

            # Alokasikan transaksi unassigned/legacy ke akun pertama
            if idx == 0:
                acc_in += unassigned_in
                acc_out += unassigned_out

            cur_bal = round(init_bal + acc_in - acc_out, 2)
            results.append({
                "id": str(acc["_id"]),
                "name": acc_name,
                "type": acc.get("type", "Bank"),
                "initial_balance": init_bal,
                "current_balance": int(cur_bal) if cur_bal.is_integer() else cur_bal
            })
        return jsonify({"status": "OK", "accounts": results})

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    acc_type = (data.get("type") or "Bank").strip()
    init_bal = float(data.get("initial_balance") or 0)
    if not name:
        return jsonify({"status": "ERR", "message": "Nama akun wajib diisi."}), 400

    db.accounts.update_one(
        {"name": name},
        {"$set": {"name": name, "type": acc_type, "initial_balance": init_bal, "updated_at": int(time.time() * 1000)}},
        upsert=True
    )
    return jsonify({"status": "OK", "name": name})


@app.route("/api/accounts/<acc_id>", methods=["GET", "PUT", "DELETE"])
def api_account_detail(acc_id):
    if request.method == "DELETE":
        db.accounts.delete_one({"_id": ObjectId(str(acc_id))})
        return jsonify({"status": "OK", "deleted": acc_id})

    old_doc = db.accounts.find_one({"_id": ObjectId(str(acc_id))})
    if not old_doc:
        return jsonify({"status": "ERR", "message": "Akun tidak ditemukan."}), 404

    if request.method == "GET":
        return jsonify({
            "status": "OK",
            "account": {
                "id": str(old_doc["_id"]),
                "name": old_doc.get("name", ""),
                "type": old_doc.get("type", "Bank"),
                "initial_balance": float(old_doc.get("initial_balance", 0))
            }
        })

    data = request.get_json(silent=True) or {}
    upd = {}
    new_name = (data.get("name") or "").strip()
    if new_name and new_name != old_doc.get("name"):
        upd["name"] = new_name
        # Update nama akun di transaksi & tagihan yang terkait
        db.transactions.update_many({"account": old_doc.get("name")}, {"$set": {"account": new_name}})
        db.transactions.update_many({"target_account": old_doc.get("name")}, {"$set": {"target_account": new_name}})
        db.bills.update_many({"account": old_doc.get("name")}, {"$set": {"account": new_name}})

    if "type" in data and str(data["type"]).strip():
        upd["type"] = str(data["type"]).strip()
    if "initial_balance" in data:
        upd["initial_balance"] = float(data["initial_balance"] or 0)

    if upd:
        upd["updated_at"] = int(time.time() * 1000)
        db.accounts.update_one({"_id": old_doc["_id"]}, {"$set": upd})

    return jsonify({"status": "OK", "id": acc_id})


@app.route("/api/budgets", methods=["GET", "POST"])
def api_budgets():
    if request.method == "GET":
        docs = list(db.budgets.find())
        items = [{"id": str(d["_id"]), "category": d.get("category", "TOTAL"), "limit": float(d.get("limit", 0))} for d in docs]
        return jsonify({"status": "OK", "budgets": items})

    data = request.get_json(silent=True) or {}
    cat = (data.get("category") or "TOTAL").strip()
    limit_val = float(data.get("limit") or 0)
    db.budgets.update_one(
        {"category": cat},
        {"$set": {"category": cat, "limit": limit_val, "updated_at": int(time.time() * 1000)}},
        upsert=True
    )
    return jsonify({"status": "OK", "category": cat, "limit": limit_val})


@app.route("/api/budgets/<budget_id>", methods=["DELETE"])
def api_delete_budget(budget_id):
    db.budgets.delete_one({"_id": ObjectId(str(budget_id))})
    return jsonify({"status": "OK", "deleted": budget_id})


@app.route("/api/bills", methods=["GET", "POST"])
def api_bills():
    if request.method == "GET":
        docs = list(db.bills.find().sort("due_day", ASCENDING))
        items = [{
            "id": str(d["_id"]),
            "name": d.get("name", ""),
            "amount": float(d.get("amount", 0)),
            "due_day": int(d.get("due_day", 1)),
            "due_month": d.get("due_month", ""),
            "paid_month": d.get("paid_month", ""),
            "is_recurring": bool(d.get("is_recurring", True)),
            "account": d.get("account", "Rekening Bank")
        } for d in docs]
        return jsonify({"status": "OK", "bills": items})

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    amount = float(data.get("amount") or 0)
    due_day = int(data.get("due_day") or 1)
    acc = (data.get("account") or "Rekening Bank").strip()
    due_month = (data.get("due_month") or datetime.now().strftime("%Y-%m")).strip()
    is_recurring = bool(data.get("is_recurring", True))

    if not name or amount <= 0:
        return jsonify({"status": "ERR", "message": "Nama dan nominal tagihan wajib diisi."}), 400

    doc = {
        "name": name,
        "amount": amount,
        "due_day": due_day,
        "due_month": due_month,
        "paid_month": "",
        "is_recurring": is_recurring,
        "account": acc,
        "created_at": int(time.time() * 1000)
    }
    res = db.bills.insert_one(doc)
    return jsonify({"status": "OK", "id": str(res.inserted_id), "name": name})


@app.route("/api/bills/<bill_id>", methods=["GET", "PUT", "DELETE"])
def api_bill_detail(bill_id):
    if request.method == "DELETE":
        db.bills.delete_one({"_id": ObjectId(str(bill_id))})
        return jsonify({"status": "OK", "deleted": bill_id})

    doc = db.bills.find_one({"_id": ObjectId(str(bill_id))})
    if not doc:
        return jsonify({"status": "ERR", "message": "Tagihan tidak ditemukan."}), 404

    if request.method == "GET":
        return jsonify({
            "status": "OK",
            "bill": {
                "id": str(doc["_id"]),
                "name": doc.get("name", ""),
                "amount": float(doc.get("amount", 0)),
                "due_day": int(doc.get("due_day", 1)),
                "due_month": doc.get("due_month", ""),
                "paid_month": doc.get("paid_month", ""),
                "is_recurring": bool(doc.get("is_recurring", True)),
                "account": doc.get("account", "Rekening Bank")
            }
        })

    data = request.get_json(silent=True) or {}
    upd = {}
    if "name" in data and str(data["name"]).strip():
        upd["name"] = str(data["name"]).strip()
    if "amount" in data and float(data["amount"]) > 0:
        upd["amount"] = float(data["amount"])
    if "due_day" in data:
        upd["due_day"] = max(1, min(31, int(data["due_day"])))
    if "due_month" in data:
        upd["due_month"] = str(data["due_month"]).strip()
    if "is_recurring" in data:
        upd["is_recurring"] = bool(data["is_recurring"])
    if "account" in data and str(data["account"]).strip():
        upd["account"] = str(data["account"]).strip()
    if "paid_month" in data:
        upd["paid_month"] = str(data["paid_month"]).strip()

    if upd:
        db.bills.update_one({"_id": doc["_id"]}, {"$set": upd})

    updated_doc = db.bills.find_one({"_id": doc["_id"]})
    return jsonify({
        "status": "OK",
        "bill": {
            "id": str(updated_doc["_id"]),
            "name": updated_doc.get("name", ""),
            "amount": float(updated_doc.get("amount", 0)),
            "due_day": int(updated_doc.get("due_day", 1)),
            "due_month": updated_doc.get("due_month", ""),
            "paid_month": updated_doc.get("paid_month", ""),
            "is_recurring": bool(updated_doc.get("is_recurring", True)),
            "account": updated_doc.get("account", "Rekening Bank")
        }
    })


@app.route("/api/bills/<bill_id>/toggle-recurring", methods=["POST"])
def api_toggle_recurring_bill(bill_id):
    doc = db.bills.find_one({"_id": ObjectId(str(bill_id))})
    if not doc:
        return jsonify({"status": "ERR", "message": "Tagihan tidak ditemukan."}), 404

    current_val = bool(doc.get("is_recurring", True))
    new_val = not current_val
    db.bills.update_one({"_id": doc["_id"]}, {"$set": {"is_recurring": new_val}})
    return jsonify({"status": "OK", "is_recurring": new_val})


@app.route("/api/bills/<bill_id>/pay", methods=["POST"])
def api_pay_bill(bill_id):
    doc = db.bills.find_one({"_id": ObjectId(str(bill_id))})
    if not doc:
        return jsonify({"status": "ERR", "message": "Tagihan tidak ditemukan."}), 404

    data = request.get_json(silent=True) or {}
    target_month = (data.get("month") or datetime.now().strftime("%Y-%m")).strip()
    db.bills.update_one({"_id": doc["_id"]}, {"$set": {"paid_month": target_month}})

    # Buat transaksi pengeluaran otomatis
    tx_doc = {
        "type": "OUT",
        "category": "Tagihan & Cicilan",
        "amount": doc.get("amount", 0),
        "note": f"Bayar Tagihan: {doc.get('name', 'Tagihan')} ({target_month})",
        "account": doc.get("account", "Rekening Bank"),
        "receipt_image": "",
        "date": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "timestamp": int(time.time() * 1000)
    }
    db.transactions.insert_one(tx_doc)
    return jsonify({"status": "OK", "paid_month": target_month, "is_recurring": bool(doc.get("is_recurring", True))})


@app.route("/api/bills/<bill_id>/unpay", methods=["POST"])
def api_unpay_bill(bill_id):
    doc = db.bills.find_one({"_id": ObjectId(str(bill_id))})
    if not doc:
        return jsonify({"status": "ERR", "message": "Tagihan tidak ditemukan."}), 404

    db.bills.update_one({"_id": doc["_id"]}, {"$set": {"paid_month": ""}})
    return jsonify({"status": "OK", "paid_month": ""})


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