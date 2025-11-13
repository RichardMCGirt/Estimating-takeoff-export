# === server.py (top of file) =================================================
from flask import Flask, request, jsonify, make_response, send_file
from flask_cors import CORS
import xlwings as xw
import os, datetime, shutil, math, threading, re
import traceback, sys, json
from io import BytesIO

# -----------------------------------------------------------------------------
# App init
# -----------------------------------------------------------------------------
app = Flask(__name__)

# Allow your production site (and optionally local dev) to call this server
from flask_cors import CORS

# After app creation
CORS(app, resources={r"/inject": {"origins": "*"}}, methods=["GET", "POST", "OPTIONS"], supports_credentials=True)



app.config["PROPAGATE_EXCEPTIONS"] = True

# Simple health check
@app.route("/", methods=["GET"])
def root():
    return "alive " + app.root_path, 200


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Debug, ngrok-skip-browser-warning"
    return response


# -----------------------------------------------------------------------------
# Paths & simple diagnostics
# -----------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_NAME = "plan.xlsb"
TEMPLATE_PATH = os.path.join(BASE_DIR, TEMPLATE_NAME)

def _path_debug():
    info = {
        "base_dir": BASE_DIR,
        "template_name": TEMPLATE_NAME,
        "template_path": TEMPLATE_PATH,
        "template_exists": os.path.exists(TEMPLATE_PATH),
        "template_isfile": os.path.isfile(TEMPLATE_PATH),
        "template_readable": os.access(TEMPLATE_PATH, os.R_OK),
        "out_dir": os.path.join(BASE_DIR, "out"),
        "base_dir_listing": sorted(os.listdir(BASE_DIR)),
    }
    print("\n=== PATH DEBUG ===")
    print(json.dumps(info, indent=2))
    print("==================\n")
    return info

@app.route("/health", methods=["GET"])
def health():
    try:
        info = _path_debug()
        return jsonify({"ok": True, **info}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# Run once at startup so you see paths in the service console/logs
_ = _path_debug()

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _is_labor_row(row: dict) -> bool:
    sku = str((row or {}).get("SKU", ""))
    return "labor" in sku.lower()

def split_labor(rows):
    non_labor, labor = [], []
    for r in rows or []:
        (labor if _is_labor_row(r) else non_labor).append(r)
    return non_labor, labor

def sort_by_description(rows):
    rows = rows or []
    def _key(r):
        d2  = r.get("Description2") or ""
        d1  = r.get("Description") or ""
        sku = r.get("SKU") or ""
        return (str(d2).lower(), str(d1).lower(), str(sku).lower())
    return sorted(rows, key=_key)

def sort_by_sku(rows):
    rows = rows or []
    def _key(r):
        sku = r.get("SKU") or ""
        d2  = r.get("Description2") or ""
        d1  = r.get("Description") or ""
        return (str(sku).lower(), str(d2).lower(), str(d1).lower())
    return sorted(rows, key=_key)

injection_lock = threading.Lock()

# -----------------------------------------------------------------------------
# Route: /inject
# -----------------------------------------------------------------------------
@app.route('/inject', methods=['POST', 'OPTIONS'])
def inject():
    # --- CORS preflight fast-path ---
    if request.method == 'OPTIONS':
        requested = request.headers.get('Access-Control-Request-Headers', '')
        resp = app.make_response('')
        resp.status_code = 204
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, ngrok-skip-browser-warning, X-Debug'
        resp.headers['Access-Control-Max-Age'] = '600'
        return resp

    debug = request.headers.get('X-Debug', '').strip() == '1'

    # Parse JSON safely (never crash on malformed JSON)
    try:
        payload = request.get_json(silent=True)
    except Exception as e:
        if debug:
            return jsonify({"error": "Bad JSON", "exception": str(e)}), 400
        return jsonify({"error": "Bad JSON"}), 400

    # --- PING: zero Excel work, always available ---
    if isinstance(payload, dict) and payload.get('type') == 'ping':
        return jsonify({"ok": True, "mode": "ping"}), 200

    # Concurrency guard
    if not injection_lock.acquire(blocking=False):
        return jsonify({'error': 'Another injection is currently running. Please wait.'}), 429

    app_xl = None
    wb = None
    try:
        # Validate shape early and cleanly
        if not isinstance(payload, dict):
            return jsonify({'error': 'Invalid payload (must be JSON object)'}), 400
        if 'type' not in payload or 'data' not in payload:
            return jsonify({'error': 'Invalid payload (must include \"data\" and \"type\")'}), 400

        data = payload.get('data') or []
        breakout_data = payload.get('breakout') or []
        labor_rates = payload.get('laborRates') or {}
        data_type = payload.get('type')
        metadata = payload.get('metadata') or {}

        print(f"data rows: {len(data) if isinstance(data, list) else 'n/a'} | breakout rows: {len(breakout_data) if isinstance(breakout_data, list) else 'n/a'}")
        print("metadata:", metadata)

        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        output_filename = f"Vanir_Takeoff_{timestamp}.xlsb"

        # Always write to a local 'out' folder next to the app (works for services too)
        out_dir = os.path.join(BASE_DIR, "out")
        os.makedirs(out_dir, exist_ok=True)

        print("TEMPLATE PATH:", TEMPLATE_PATH, "exists=", os.path.exists(TEMPLATE_PATH))
        print("BASE_DIR listing:", os.listdir(BASE_DIR))
        if not os.path.exists(TEMPLATE_PATH):
            raise FileNotFoundError(f"Template not found: {TEMPLATE_PATH}")

        output_path = os.path.join(out_dir, output_filename)
        shutil.copyfile(TEMPLATE_PATH, output_path)

        # Launch Excel safely
        try:
            print("About to launch Excel via xlwings...")
            app_xl = xw.App(visible=False, add_book=False)
            app_xl.display_alerts = False
            app_xl.screen_updating = False
            wb = app_xl.books.open(output_path)
            print("Excel open OK.")
        except Exception as excel_exc:
            print(" Excel open failed:", repr(excel_exc))
            traceback.print_exc(file=sys.stderr)
            return jsonify({"error": f"Excel open failed: {excel_exc}"}), 500

        if data_type in ["elevation", "combined"]:
            print(" Injecting Elevation Sheet")
            try:
                sheet = wb.sheets["TakeOff Template"]
            except Exception as e:
                return jsonify({"error": f"Sheet not found: {e}"}), 500

            # SAFE: guard first row
            first_row = (data[0] if isinstance(data, list) and data else {})
            raw_folder = first_row.get("Folder") or metadata.get("elevation", "")
            folder_name = (raw_folder or "").strip().lower()
            elevation_value = (metadata.get("elevation", "") or folder_name).strip().title()

            metadata_values = [
                metadata.get("builder", ""),
                metadata.get("planName", ""),
                elevation_value,
                metadata.get("materialType", ""),
                metadata.get("date", ""),
                metadata.get("estimator", "")
            ]

            for row_index, value in enumerate(metadata_values, start=15):
                start_col = 12  # Column L
                end_col = 15    # Column O
                cell_range = sheet.range((row_index, start_col), (row_index, end_col))
                if cell_range.api.MergeCells:
                    cell_range.api.UnMerge()
                cell_range[0, 0].value = value
                cell_range.api.Merge()
                cell_range.api.HorizontalAlignment = -4108  # center
                cell_range.api.VerticalAlignment = -4108     # center

            # Clear non-labor ranges
            try:
                sheet.range("A8:A100").clear_contents()
                sheet.range("C8:C100").clear_contents()
                sheet.range("E8:E100").clear_contents()
                sheet.range("F8:F100").clear_contents()
            except Exception as e:
                return jsonify({"error": f"Failed clearing ranges (sheet protected?): {e}"}), 500

            non_labor_data, _ = split_labor(data)
            non_labor_data = sort_by_sku(non_labor_data)

            for i, row in enumerate(non_labor_data, start=8):
                sku = row.get("SKU", "")
                desc2 = row.get("Description2", "")
                qty_raw = row.get("TotalQty", 0)
                color_group = row.get("ColorGroup", "")
                uom = (row.get("UOM") or "").strip().upper()

                is_labor = "labor" in sku.lower()
                skip_rounding = is_labor or uom == "SQ"
                try:
                    q = float(qty_raw) if qty_raw not in [None, ""] else 0
                except ValueError:
                    q = 0
                total_qty = q if skip_rounding else math.ceil(abs(q))

                sheet.range(f"A{i}").value = sku
                sheet.range(f"C{i}").value = desc2
                sheet.range(f"E{i}").value = total_qty
                sheet.range(f"F{i}").value = color_group

            # Paint labor to L48 (optional)
            paint_labor_raw = str(metadata.get("paintlabor") or "").strip()
            paint_labor_cleaned = re.sub(r'[^\d.\-]', '', paint_labor_raw)
            if paint_labor_cleaned:
                try:
                    sheet.range("L48").value = float(paint_labor_cleaned)
                    print(f" Paint Labor injected into L48: {paint_labor_cleaned}")
                except ValueError:
                    print(f" Invalid paint labor value after cleanup: {paint_labor_cleaned}")

            # Inject labor lines
            try:
                labor_start_row = 34
                labor_end_row = 52
                current_row = labor_start_row

                KEY_TO_CANON = {
                    "beamwrap": "WR", "bb": "BB", "bracket": "BRACKET",
                    "ceiling": "CEIL", "tngceiling": "TNGCEIL", "column": "COLUMN",
                    "lap": "LAP", "louver": "LOUVER", "other": "OTHER",
                    "paint": "PAINT", "shake": "SHAKE", "shutter": "SHUTTER",
                }
                CANON_TO_LABEL = {
                    "WR": "Beam Wrap", "BB": "B&B", "BRACKET": "Bracket",
                    "CEIL": "Ceiling", "TNGCEIL": "T&G Ceiling", "COLUMN": "Column",
                    "LAP": "Lap", "LOUVER": "Louver", "OTHER": "Other",
                    "PAINT": "Paint", "SHAKE": "Shake", "SHUTTER": "Shutter",
                }
                CANON_TO_UI_NORM = {
                    "WR": "beamwraplabor", "BB": "bblabor", "BRACKET": "bracketlabor",
                    "CEIL": "ceilinglabor", "TNGCEIL": "tngceilinglabor", "COLUMN": "columnlabor",
                    "LAP": "laplabor", "LOUVER": "louverlabor", "OTHER": "otherlabor",
                    "PAINT": "paintlabor", "SHAKE": "shakelabor", "SHUTTER": "shutterlabor",
                }

                def canon_from_ui_key(ui_key: str) -> str:
                    k = re.sub(r'[^a-z]', '', (ui_key or '').lower())
                    k = k[:-5] if k.endswith('labor') else k
                    return KEY_TO_CANON.get(k, k.upper())

                def canon_from_sku(sku: str) -> str:
                    return (sku or '').upper().replace('ZLABOR', '')

                def sku_from_canon(canon: str) -> str:
                    return 'zLABOR' + canon

                labor_items_from_data = {
                    (item.get("SKU") or "").strip().upper(): item
                    for item in (data or [])
                    if "ZLABOR" in (item.get("SKU") or "").upper()
                }

                canon_keys = set()
                for sku in labor_items_from_data.keys():
                    canon_keys.add(canon_from_sku(sku))

                normalized_labor_rates = { (k or "").lower(): v for k, v in (labor_rates or {}).items() }
                for ui_key in (labor_rates or {}).keys():
                    canon_keys.add(canon_from_ui_key(ui_key))

                # Avoid creating a separate "Paint" row if template uses L48
                if "PAINT" in canon_keys:
                    canon_keys.remove("PAINT")

                for canon in sorted(canon_keys):
                    if current_row > labor_end_row:
                        print(" Reached max labor row limit.")
                        break

                    sku = sku_from_canon(canon)
                    label = f'{CANON_TO_LABEL.get(canon, canon.title())} Labor'

                    qty_raw = labor_items_from_data.get(sku.upper(), {}).get("TotalQty")
                    try:
                        qty = float(qty_raw) if qty_raw not in [None, ""] else 0
                    except ValueError:
                        qty = ""

                    ui_norm_key = CANON_TO_UI_NORM.get(canon, canon.lower() + "labor")
                    rate = normalized_labor_rates.get(ui_norm_key, "")

                    sheet.range(f"K{current_row}").value = sku
                    sheet.range(f"A{current_row}").value = ""
                    sheet.range(f"L{current_row}").value = qty
                    sheet.range(f"N{current_row}").value = rate

                    print(f" Injected: Row {current_row} | {label} | SKU={sku} | Qty={qty} | Rate={rate}")
                    current_row += 1

            except Exception as e:
                return jsonify({"error": f"Error injecting labor: {e}"}), 500

        #  Inject Material Break Out (if provided)
        if breakout_data:
            print(" Injecting Material Break Out Sheet")
            try:
                try:
                    sheet = wb.sheets["Material Break Out"]
                except Exception as e:
                    return jsonify({"error": f"Sheet 'Material Break Out' not found: {e}"}), 500

                try:
                    sheet.range("A9:F100").clear_contents()
                except Exception as e:
                    return jsonify({"error": f"Failed clearing Material Break Out ranges: {e}"}), 500

                breakout_data = sort_by_sku(breakout_data)

                for i, row in enumerate(breakout_data, start=9):
                    sku = row.get("SKU", "")
                    desc = row.get("Description", "")
                    desc2 = row.get("Description2", "")
                    qty_raw = row.get("TotalQty", row.get("QTY", 0))
                    color_group = row.get("ColorGroup", "")
                    uom = (row.get("UOM") or "").strip().upper()

                    is_labor = "labor" in sku.lower()
                    skip_rounding = is_labor or uom == "SQ"
                    total_qty = qty_raw  # breakout uses raw

                    sheet.range(f"A{i}").value = sku
                    sheet.range(f"B{i}").value = desc
                    sheet.range(f"D{i}").value = uom
                    sheet.range(f"C{i}").value = desc2
                    sheet.range(f"E{i}").value = total_qty
                    sheet.range(f"F{i}").value = color_group

                print(f" Injected {len(breakout_data)} rows into 'Material Break Out'")

            except Exception as e:
                return jsonify({"error": f"Breakout injection failed: {e}"}), 500

        # Save and return file
        try:
            wb.save()
        finally:
            try:
                if wb: wb.close()
            except Exception as e:
                print("wb.close() failed:", e)
            try:
                if app_xl:
                    app_xl.display_alerts = False
                    app_xl.screen_updating = False
                    app_xl.quit()
            except Exception as e:
                print(" app_xl.quit() failed:", e)

        with open(output_path, "rb") as f:
            data_bytes = f.read()
        resp = make_response(data_bytes, 200)
        resp.headers["Content-Type"] = "application/vnd.ms-excel.sheet.macroEnabled.12"
        resp.headers["Content-Disposition"] = f"attachment; filename={output_filename}"
        print("=== /inject OK ===")
        return resp

    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        if debug:
            return jsonify({"error": "Internal error during injection", "exception": str(e), "traceback": traceback.format_exc()}), 500
        return jsonify({"error": "Internal error during injection"}), 500
    finally:
        try:
            injection_lock.release()
        except Exception:
            pass

# -----------------------------------------------------------------------------
# Entrypoint
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    from waitress import serve
    print("Starting server with Waitress on port 5050...")
    serve(app, host="0.0.0.0", port=5050)
