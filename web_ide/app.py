from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
import shutil
import subprocess
import threading
import pty
import select
import termios
import struct
import fcntl
import signal
from collections import defaultdict

app = Flask(__name__, static_folder="static")
app.config['SECRET_KEY'] = 'your-secret-key-here'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

WORKSPACE_DIR = os.path.abspath("/")

# Store terminal sessions
terminal_sessions = defaultdict(dict)


def safe_join(base, *paths):
    # Prevent directory traversal
    final_path = os.path.abspath(os.path.join(base, *paths))
    if not final_path.startswith(base):
        raise ValueError("Unsafe path access attempt")
    return final_path


class TerminalSession:
    def __init__(self, session_id, working_dir=None):
        self.session_id = session_id
        self.working_dir = working_dir or WORKSPACE_DIR
        self.master_fd = None
        self.slave_fd = None
        self.process = None
        self.thread = None
        
    def start(self):
        try:
            # Create a pseudo-terminal
            self.master_fd, self.slave_fd = pty.openpty()
            
            # Set terminal size
            self._set_terminal_size(80, 24)
            
            # Start shell process
            env = os.environ.copy()
            env['TERM'] = 'xterm-256color'
            env['PS1'] = r'\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
            
            self.process = subprocess.Popen(
                ['/bin/bash', '--login'],
                stdin=self.slave_fd,
                stdout=self.slave_fd,
                stderr=self.slave_fd,
                preexec_fn=os.setsid,
                env=env,
                cwd=self.working_dir
            )
            
            # Close slave fd in parent process
            os.close(self.slave_fd)
            
            # Start reading thread
            self.thread = threading.Thread(target=self._read_output)
            self.thread.daemon = True
            self.thread.start()
            
            return True
        except Exception as e:
            print(f"Failed to start terminal: {e}")
            return False
    
    def _set_terminal_size(self, cols, rows):
        if self.master_fd:
            try:
                size = struct.pack('HHHH', rows, cols, 0, 0)
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, size)
            except:
                pass
    
    def _read_output(self):
        try:
            while True:
                if self.master_fd is None:
                    break
                    
                # Use select to check if data is available
                ready, _, _ = select.select([self.master_fd], [], [], 0.1)
                if ready:
                    try:
                        data = os.read(self.master_fd, 1024)
                        if data:
                            output = data.decode('utf-8', errors='replace')
                            socketio.emit('terminal_output', {
                                'session_id': self.session_id,
                                'data': output
                            }, to=self.session_id)
                        else:
                            break
                    except OSError:
                        break
        except Exception as e:
            print(f"Terminal read error: {e}")
        finally:
            self._cleanup()
    
    def write_input(self, data):
        if self.master_fd:
            try:
                os.write(self.master_fd, data.encode('utf-8'))
            except OSError:
                pass
    
    def resize(self, cols, rows):
        self._set_terminal_size(cols, rows)
    
    def _cleanup(self):
        try:
            if self.master_fd:
                os.close(self.master_fd)
                self.master_fd = None
        except:
            pass
        
        try:
            if self.process:
                os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
                self.process.terminate()
                self.process = None
        except:
            pass
    
    def close(self):
        self._cleanup()


@app.route("/api/create", methods=["POST"])
def create():
    data = request.get_json()
    rel_path = data.get("path", "").strip()
    type_ = data.get("type", "").strip()

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


# Terminal WebSocket events
@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")


@socketio.on('disconnect')
def handle_disconnect():
    session_id = request.sid
    print(f"Client disconnected: {session_id}")
    if session_id in terminal_sessions:
        terminal_sessions[session_id]['terminal'].close()
        del terminal_sessions[session_id]
    leave_room(session_id)
    

    

@socketio.on('start_terminal')
def handle_start_terminal(data):
    print(f"[TERMINAL START REQUEST] {data}") 
    session_id = request.sid
    working_dir = data.get('working_dir', WORKSPACE_DIR)
    join_room(session_id)

    
    # Close existing terminal if any
    if session_id in terminal_sessions:
        terminal_sessions[session_id]['terminal'].close()
    
    # Create new terminal session
    terminal = TerminalSession(session_id, working_dir)
    if terminal.start():
        terminal_sessions[session_id] = {
            'terminal': terminal,
            'working_dir': working_dir
        }
        emit('terminal_ready', {'session_id': session_id})
    else:
        emit('terminal_error', {'message': 'Failed to start terminal'})


@socketio.on('terminal_input')
def handle_terminal_input(data):
    session_id = request.sid
    if session_id in terminal_sessions:
        terminal = terminal_sessions[session_id]['terminal']
        terminal.write_input(data['data'])


@socketio.on('terminal_resize')
def handle_terminal_resize(data):
    session_id = request.sid
    if session_id in terminal_sessions:
        terminal = terminal_sessions[session_id]['terminal']
        terminal.resize(data['cols'], data['rows'])


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=7860, debug=True, allow_unsafe_werkzeug=True)