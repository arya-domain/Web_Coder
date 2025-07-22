from flask import Flask, request, jsonify, send_from_directory
import os
import shutil

app = Flask(__name__, static_folder="static")

WORKSPACE_DIR = os.path.abspath("/")


def safe_join(base, *paths):
    # Prevent directory traversal
    final_path = os.path.abspath(os.path.join(base, *paths))
    if not final_path.startswith(base):
        raise ValueError("Unsafe path access attempt")
    return final_path


@app.route("/api/create", methods=["POST"])
def create():
    data = request.get_json()
    rel_path = data.get("path", "").strip()
    type_ = data.get("type", "").strip()  # "file" or "folder"

    try:
        target_path = safe_join(WORKSPACE_DIR, rel_path)

        if os.path.exists(target_path):
            return "Already exists", 400

        if type_ == "file":
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            open(target_path, "w").close()
        elif type_ == "folder":
            os.makedirs(target_path)
        else:
            return "Invalid type", 400

        return "Created", 200

    except ValueError as ve:
        return f"Security error: {ve}", 403
    except Exception as e:
        return f"Error: {e}", 500


@app.route("/api/delete", methods=["POST"])
def delete():
    data = request.get_json()
    rel_path = data.get("path", "").strip()

    try:
        target_path = safe_join(WORKSPACE_DIR, rel_path)

        if not os.path.exists(target_path):
            return "Path not found", 404

        if os.path.isfile(target_path):
            os.remove(target_path)
        elif os.path.isdir(target_path):
            shutil.rmtree(target_path)
        else:
            return "Invalid type", 400

        return "Deleted", 200

    except ValueError as ve:
        return f"Security error: {ve}", 403
    except Exception as e:
        return f"Error: {e}", 500


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("static", path)


@app.route("/api/list", methods=["GET"])
def list_files():
    rel_path = request.args.get("dir", "").strip()

    try:
        target_dir = safe_join(WORKSPACE_DIR, rel_path)

        if not os.path.exists(target_dir):
            return jsonify({"error": "Directory not found"}), 404

        entries = []
        for item in os.listdir(target_dir):
            full_path = os.path.join(target_dir, item)
            entries.append({
                "name": item,
                "type": "folder" if os.path.isdir(full_path) else "file"
            })
        return jsonify(entries)

    except ValueError as ve:
        return f"Security error: {ve}", 403


@app.route("/api/read", methods=["GET"])
def read_file():
    rel_path = request.args.get("path", "").strip()

    try:
        file_path = safe_join(WORKSPACE_DIR, rel_path)

        if not os.path.isfile(file_path):
            return "File not found", 404

        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    except ValueError as ve:
        return f"Security error: {ve}", 403


@app.route("/api/save", methods=["POST"])
def save_file():
    data = request.get_json()
    rel_path = data.get("path", "").strip()
    content = data.get("content", "")

    try:
        file_path = safe_join(WORKSPACE_DIR, rel_path)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        return "Saved", 200

    except ValueError as ve:
        return f"Security error: {ve}", 403
    except Exception as e:
        return f"Error: {e}", 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7860, debug=True)
