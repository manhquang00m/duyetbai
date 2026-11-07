"""Thread Affiliate Launcher: Start/Stop `npm start`, xem log, tu mo browser.

Dung `npm start` (server KHONG --watch) thay vi `npm run dev`: ban watch bi restart lien tuc.
Sua code server thi bam Stop -> Start de nap lai.

Chay: pythonw launcher/duyetbai_launcher.pyw  (hoac double-click shortcut tao boi create_shortcut.ps1)
Chi dung thu vien chuan (tkinter co san trong Python cho Windows).
"""
from __future__ import annotations

import os
import queue
import re
import shutil
import socket
import subprocess
import threading
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import messagebox, scrolledtext

APP_NAME = "Thread Affiliate Launcher"
REPO = Path(__file__).resolve().parent.parent
SERVER_PORT = 3000
CLIENT_PORT = 5173
MAX_LOG_LINES = 5000
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
# Vite in ra dang "  ➜  Local:   http://localhost:5173/" -> lay URL that (phong khi Vite nhay sang cong khac)
VITE_URL_RE = re.compile(r"Local:\s+(http://\S+)")

GREEN = "#1f9d55"
RED = "#c0392b"
GREY = "#7f8c8d"


def port_open(port: int) -> bool:
    """Thu ket noi ca IPv4 lan IPv6 (Vite tren Node 22 hay bind vao ::1)."""
    for host in ("127.0.0.1", "::1"):
        try:
            with socket.create_connection((host, port), timeout=0.3):
                return True
        except OSError:
            continue
    return False


class Launcher:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.proc: subprocess.Popen[bytes] | None = None
        self.log_q: queue.Queue[str | None] = queue.Queue()
        self.busy = False  # dang stop -> khoa nut
        self.browser_opened = False
        self.client_url = f"http://localhost:{CLIENT_PORT}"
        self.port_state = {SERVER_PORT: False, CLIENT_PORT: False}

        root.title(APP_NAME)
        icon = Path(__file__).with_name("app.ico")
        if icon.exists():
            root.iconbitmap(default=str(icon))
        root.geometry("900x560")
        root.minsize(640, 360)
        root.protocol("WM_DELETE_WINDOW", self.on_close)

        bar = tk.Frame(root, padx=8, pady=8)
        bar.pack(fill=tk.X)
        self.btn_start = tk.Button(bar, text="Start", width=10, command=self.start)
        self.btn_stop = tk.Button(bar, text="Stop", width=10, command=self.stop)
        self.btn_open = tk.Button(bar, text="Mở trình duyệt", width=14, command=self.open_browser)
        self.btn_clear = tk.Button(bar, text="Xóa log", width=10, command=self.clear_log)
        for b in (self.btn_start, self.btn_stop, self.btn_open, self.btn_clear):
            b.pack(side=tk.LEFT, padx=(0, 6))

        self.lbl_client = tk.Label(bar, text=f"● Client :{CLIENT_PORT}", fg=GREY, font=("Segoe UI", 10, "bold"))
        self.lbl_server = tk.Label(bar, text=f"● Server :{SERVER_PORT}", fg=GREY, font=("Segoe UI", 10, "bold"))
        self.lbl_client.pack(side=tk.RIGHT, padx=(10, 0))
        self.lbl_server.pack(side=tk.RIGHT)

        self.log = scrolledtext.ScrolledText(
            root, wrap=tk.WORD, font=("Consolas", 10), bg="#1e1e1e", fg="#d4d4d4",
            insertbackground="#d4d4d4", state=tk.DISABLED,
        )
        self.log.pack(fill=tk.BOTH, expand=True, padx=8, pady=(0, 8))
        self.log.tag_configure("sys", foreground="#4fc1ff")
        self.log.tag_configure("err", foreground="#f48771")

        self.append(f"Repo: {REPO}", "sys")
        self.refresh_buttons()
        self.root.after(100, self.drain_log)
        self.root.after(300, self.poll_ports)

    # ---------- log ----------
    def append(self, text: str, tag: str | None = None) -> None:
        self.log.configure(state=tk.NORMAL)
        self.log.insert(tk.END, text + "\n", tag or ())
        lines = int(self.log.index("end-1c").split(".")[0])
        if lines > MAX_LOG_LINES:
            self.log.delete("1.0", f"{lines - MAX_LOG_LINES}.0")
        self.log.configure(state=tk.DISABLED)
        self.log.see(tk.END)

    def clear_log(self) -> None:
        self.log.configure(state=tk.NORMAL)
        self.log.delete("1.0", tk.END)
        self.log.configure(state=tk.DISABLED)

    def drain_log(self) -> None:
        try:
            while True:
                item = self.log_q.get_nowait()
                if item is None:  # tien trinh dev da thoat
                    self.on_proc_exit()
                    continue
                m = VITE_URL_RE.search(item)
                if m:
                    self.client_url = m.group(1).rstrip("/")
                self.append(item)
        except queue.Empty:
            pass
        self.root.after(100, self.drain_log)

    def reader(self, proc: subprocess.Popen[bytes]) -> None:
        assert proc.stdout is not None
        for raw in iter(proc.stdout.readline, b""):
            self.log_q.put(ANSI_RE.sub("", raw.decode("utf-8", errors="replace").rstrip()))
        proc.stdout.close()
        proc.wait()
        self.log_q.put(None)

    # ---------- trang thai ----------
    def running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def refresh_buttons(self) -> None:
        run = self.running()
        self.btn_start.configure(state=tk.DISABLED if run or self.busy else tk.NORMAL)
        self.btn_stop.configure(state=tk.NORMAL if not self.busy else tk.DISABLED)
        self.btn_open.configure(state=tk.NORMAL if self.port_state[CLIENT_PORT] else tk.DISABLED)

    def poll_ports(self) -> None:
        def work() -> None:
            state = {p: port_open(p) for p in (SERVER_PORT, CLIENT_PORT)}
            self.root.after(0, lambda: self.apply_ports(state))

        threading.Thread(target=work, daemon=True).start()

    def apply_ports(self, state: dict[int, bool]) -> None:
        self.port_state = state
        self.lbl_server.configure(fg=GREEN if state[SERVER_PORT] else RED if self.running() else GREY)
        self.lbl_client.configure(fg=GREEN if state[CLIENT_PORT] else RED if self.running() else GREY)
        if self.running() and state[CLIENT_PORT] and not self.browser_opened:
            self.browser_opened = True
            self.open_browser()
        self.refresh_buttons()
        self.root.after(1500, self.poll_ports)

    # ---------- hanh dong ----------
    def start(self, skip_port_check: bool = False) -> None:
        if self.running() or self.busy:
            return
        npm = shutil.which("npm.cmd") or shutil.which("npm")
        if not npm:
            messagebox.showerror(APP_NAME, "Không tìm thấy npm trong PATH. Cài Node.js rồi thử lại.")
            return
        if not skip_port_check and any(self.port_state.values()):
            if messagebox.askyesno(
                APP_NAME,
                f"Cổng {SERVER_PORT}/{CLIENT_PORT} đang bị chiếm (có thể dev server cũ còn treo).\n"
                "Dọn sạch rồi mới Start?",
            ):
                self.run_kill(then=lambda: self.start(skip_port_check=True))
                return

        env = dict(os.environ, FORCE_COLOR="0", NO_COLOR="1")
        self.append("$ npm start", "sys")
        try:
            self.proc = subprocess.Popen(
                [npm, "start"], cwd=REPO, env=env,
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                creationflags=NO_WINDOW,
            )
        except OSError as e:
            self.append(f"Không chạy được npm: {e}", "err")
            return
        self.browser_opened = False
        self.client_url = f"http://localhost:{CLIENT_PORT}"
        threading.Thread(target=self.reader, args=(self.proc,), daemon=True).start()
        self.refresh_buttons()

    def stop(self) -> None:
        self.run_kill()

    def run_kill(self, then=None) -> None:
        """Dung scripts/kill-dev.mjs: no don ca cay npm->concurrently->node --watch va watcher treo."""
        if self.busy:
            return
        self.busy = True
        self.refresh_buttons()
        self.append("$ npm run kill", "sys")
        proc = self.proc

        def work() -> None:
            if proc is not None and proc.poll() is None:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                               capture_output=True, creationflags=NO_WINDOW)
            try:
                r = subprocess.run(["node", "scripts/kill-dev.mjs"], cwd=REPO, capture_output=True,
                                   creationflags=NO_WINDOW, timeout=60)
                out = (r.stdout + r.stderr).decode("utf-8", errors="replace")
            except (OSError, subprocess.TimeoutExpired) as e:
                out = f"Lỗi khi chạy kill-dev: {e}"
            self.root.after(0, lambda: self.after_kill(out, then))

        threading.Thread(target=work, daemon=True).start()

    def after_kill(self, out: str, then) -> None:
        for line in out.strip().splitlines():
            self.append(line, "sys")
        self.busy = False
        self.refresh_buttons()
        if then:
            then()

    def on_proc_exit(self) -> None:
        code = self.proc.returncode if self.proc else None
        self.append(f"[npm start đã dừng, exit code {code}]", "sys" if self.busy or code == 0 else "err")
        self.refresh_buttons()

    def open_browser(self) -> None:
        webbrowser.open(self.client_url)

    def on_close(self) -> None:
        if not (self.running() or any(self.port_state.values())):
            self.root.destroy()
            return
        ans = messagebox.askyesnocancel(APP_NAME, "Dev server đang chạy. Tắt server rồi thoát?\n"
                                        "(No = thoát nhưng để server chạy tiếp)")
        if ans is None:
            return
        if ans:
            self.root.title(f"{APP_NAME} - đang tắt...")
            self.run_kill(then=self.root.destroy)
        else:
            self.root.destroy()


def main() -> None:
    # Tach khoi nhom "Python" tren taskbar -> taskbar hien icon rieng cua launcher
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ssi.thread-affiliate.launcher")
    except (AttributeError, OSError):
        pass
    root = tk.Tk()
    Launcher(root)
    root.mainloop()


if __name__ == "__main__":
    main()
