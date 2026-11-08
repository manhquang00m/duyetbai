"""Thread Affiliate Launcher: Start/Stop `npm start`, xem log, tu mo browser,
port forward ra internet qua devtunnel (private, giong VS Code), hien QR de quet tren dien thoai.

Dung `npm start` (server KHONG --watch) thay vi `npm run dev`: ban watch bi restart lien tuc.
Sua code server thi bam Stop -> Start de nap lai.

Chay: pythonw launcher/duyetbai_launcher.pyw  (hoac double-click shortcut tao boi create_shortcut.ps1)
Chi dung thu vien chuan + qr.py cung thu muc (Pillow neu co thi logo net hon, khong bat buoc).
"""
from __future__ import annotations

import json
import os
import queue
import re
import shutil
import socket
import subprocess
import threading
import tkinter as tk
import tkinter.font as tkfont
import webbrowser
from pathlib import Path
from tkinter import messagebox

from qr import make_qr

APP_NAME = "Thread Affiliate Launcher"
AUTHOR = "Mạnh Quang"
HERE = Path(__file__).resolve().parent
REPO = HERE.parent
SERVER_PORT = 3000
CLIENT_PORT = 5173
MAX_LOG_LINES = 5000
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
# Vite in ra dang "  ➜  Local:   http://localhost:5173/" -> lay URL that (phong khi Vite nhay sang cong khac)
VITE_URL_RE = re.compile(r"Local:\s+(http://\S+)")
ERROR_RE = re.compile(r"\b(error|failed|exception|eaddrinuse|econnrefused)\b", re.I)

# ---- port forward (Microsoft Dev Tunnels, cung cong nghe VS Code dung) ----
TUNNEL_FILE = HERE / ".tunnel.json"  # chi luu tunnel id, khong phai secret
TUNNEL_EXIT = "tunnel-exit"  # marker trong log_q: (TUNNEL_EXIT, proc)
TUNNEL_ID_RE = re.compile(r"Tunnel ID\s*:\s*(\S+)")
TUNNEL_URL_RE = re.compile(r"https://[^\s,]+")

# ---- giao dien ----
C = {
    "bg": "#f4f5f7",
    "card": "#ffffff",
    "border": "#e4e6eb",
    "text": "#111827",
    "muted": "#6b7280",
    "faint": "#9ca3af",
    "primary": "#d1307a",  # --primary cua client
    "primary_hover": "#b82868",
    "hover": "#f3f4f6",
    "field": "#f9fafb",
    "link": "#c0266c",
    "log_bg": "#0f1218",
    "log_fg": "#c9d1d9",
}
# (nen, chu) cho tung trang thai cua pill
PILL = {
    "off": ("#f3f4f6", "#6b7280"),
    "wait": ("#fff7e6", "#b45309"),
    "on": ("#e8f7ef", "#047857"),
    "err": ("#fdecec", "#b91c1c"),
}
ICON = {
    "play": "\uE768", "stop": "\uE71A", "open": "\uE8A7", "copy": "\uE8C8", "qr": "\uED14",
    "globe": "\uE774", "user": "\uE77B", "clear": "\uE894", "lock": "\uE72E", "cancel": "\uE711",
}


def port_open(port: int) -> bool:
    """Thu ket noi ca IPv4 lan IPv6 (Vite tren Node 22 hay bind vao ::1)."""
    for host in ("127.0.0.1", "::1"):
        try:
            with socket.create_connection((host, port), timeout=0.3):
                return True
        except OSError:
            continue
    return False


def find_devtunnel() -> str | None:
    """PATH cua launcher co the cu hon lan cai winget -> do them thu muc Links cua winget."""
    exe = shutil.which("devtunnel")
    if exe:
        return exe
    links = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Links" / "devtunnel.exe"
    return str(links) if links.exists() else None


def run_cli(args: list[str], timeout: int = 60) -> tuple[int, str]:
    """Chay lenh ngan, tra (exit code, stdout+stderr). Khong bao gio nem loi ra UI."""
    try:
        r = subprocess.run(args, capture_output=True, creationflags=NO_WINDOW, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr).decode("utf-8", errors="replace")
    except (OSError, subprocess.TimeoutExpired) as e:
        return -1, str(e)


def pick_font(*names: str) -> str:
    have = set(tkfont.families())
    return next((n for n in names if n in have), names[-1])


# ======================================================================
#  Widget nho
# ======================================================================
class FlatButton(tk.Frame):
    """Nut phang co icon (Segoe Fluent Icons), hover, trang thai disable. tk.Button tren Windows
    khong doi mau nen/vien duoc nen tu ve bang Frame + Label."""

    VARIANTS = {
        "primary": dict(bg=C["primary"], hover=C["primary_hover"], fg="#ffffff", border=C["primary"]),
        "secondary": dict(bg=C["card"], hover=C["hover"], fg=C["text"], border=C["border"]),
        "ghost": dict(bg=C["card"], hover=C["hover"], fg=C["muted"], border=C["card"]),
    }
    DISABLED = dict(bg="#f3f4f6", fg="#b4b9c2", border="#eceef1")

    def __init__(self, parent, text: str, icon: str | None = None, command=None,
                 variant: str = "secondary", fonts: dict | None = None) -> None:
        super().__init__(parent, padx=1, pady=1)
        self.command = command
        self.variant = variant
        self.enabled = True
        self.hovering = False
        self.inner = tk.Frame(self, padx=12, pady=6)
        self.inner.pack(fill=tk.BOTH, expand=True)
        self.ico = tk.Label(self.inner, font=fonts["icon"])
        self.lbl = tk.Label(self.inner, font=fonts["button"])
        self.ico.pack(side=tk.LEFT)
        self.lbl.pack(side=tk.LEFT)
        for w in (self, self.inner, self.ico, self.lbl):
            w.bind("<Enter>", self._enter)
            w.bind("<Leave>", self._leave)
            w.bind("<ButtonRelease-1>", self._click)
        self.set(text=text, icon=icon)

    def set(self, text: str | None = None, icon: str | None = None, variant: str | None = None) -> None:
        if text is not None:
            self.lbl.configure(text=text)
        if icon is not None:
            self.ico.configure(text=icon)
            self.ico.pack_configure(padx=(0, 7) if icon else 0)
        if variant is not None:
            self.variant = variant
        self._paint()

    def set_enabled(self, on: bool) -> None:
        if on != self.enabled:
            self.enabled = on
            self._paint()

    def _paint(self) -> None:
        v = self.VARIANTS[self.variant]
        if not self.enabled:
            bg, fg, border = self.DISABLED["bg"], self.DISABLED["fg"], self.DISABLED["border"]
        else:
            bg, fg, border = (v["hover"] if self.hovering else v["bg"]), v["fg"], v["border"]
        self.configure(bg=border)
        cursor = "hand2" if self.enabled else "arrow"
        for w in (self.inner, self.ico, self.lbl):
            w.configure(bg=bg, cursor=cursor)
        self.ico.configure(fg=fg)
        self.lbl.configure(fg=fg)

    def _enter(self, _e) -> None:
        self.hovering = True
        self._paint()

    def _owns(self, w) -> bool:
        return w is not None and (w is self or str(w).startswith(str(self) + "."))

    def _leave(self, _e) -> None:
        # <Leave> ban ra ca khi chuot di tu Frame vao Label con -> kiem tra thuc su ra ngoai chua
        if self._owns(self.winfo_containing(*self.winfo_pointerxy())):
            return
        self.hovering = False
        self._paint()

    def _click(self, e) -> None:
        if self.enabled and self.command and self._owns(self.winfo_containing(e.x_root, e.y_root)):
            self.command()


class Pill(tk.Frame):
    """Nhan trang thai: cham tron + chu tren nen nhat."""

    def __init__(self, parent, fonts: dict) -> None:
        super().__init__(parent, padx=10, pady=3)
        self.dot = tk.Label(self, text="●", font=fonts["small"])
        self.lbl = tk.Label(self, font=fonts["small_bold"])
        self.dot.pack(side=tk.LEFT, padx=(0, 5))
        self.lbl.pack(side=tk.LEFT)

    def set(self, state: str, text: str) -> None:
        bg, fg = PILL[state]
        for w in (self, self.dot, self.lbl):
            w.configure(bg=bg)
        self.dot.configure(fg=fg)
        self.lbl.configure(fg=fg, text=text)


# ======================================================================
#  App
# ======================================================================
class Launcher:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.proc: subprocess.Popen[bytes] | None = None
        self.log_q: queue.Queue = queue.Queue()
        self.busy = False  # dang stop -> khoa nut
        self.browser_opened = False
        self.client_url = f"http://localhost:{CLIENT_PORT}"
        self.port_state = {SERVER_PORT: False, CLIENT_PORT: False}
        self.tunnel_proc: subprocess.Popen[bytes] | None = None
        self.tunnel_url = ""
        self.tunnel_state = "off"  # off | connecting | on
        self.qr_win: tk.Toplevel | None = None

        ui = pick_font("Segoe UI Variable Text", "Segoe UI")
        semi = pick_font("Segoe UI Semibold", "Segoe UI")
        mono = pick_font("Cascadia Mono", "Consolas")
        icon = pick_font("Segoe Fluent Icons", "Segoe MDL2 Assets")
        self.f = {
            "title": (semi, 14), "subtitle": (ui, 9), "card_title": (semi, 11), "body": (ui, 10),
            "small": (ui, 9), "small_bold": (semi, 9), "button": (semi, 10), "icon": (icon, 10),
            "icon_big": (icon, 12), "mono": (mono, 9), "url": (semi, 10),
        }

        root.title(APP_NAME)
        icon_file = HERE / "app.ico"
        if icon_file.exists():
            root.iconbitmap(default=str(icon_file))
        scale = root.winfo_fpixels("1i") / 96
        root.geometry(f"{int(980 * scale)}x{int(680 * scale)}")
        root.minsize(int(860 * scale), int(600 * scale))
        root.configure(bg=C["bg"])
        root.protocol("WM_DELETE_WINDOW", self.on_close)

        self._build_header()
        self._build_footer()  # pack truoc body de luon dinh day khi thu nho cua so
        body = tk.Frame(root, bg=C["bg"], padx=18, pady=12)
        body.pack(fill=tk.BOTH, expand=True)
        body.columnconfigure(0, weight=1, uniform="cards")
        body.columnconfigure(1, weight=1, uniform="cards")
        body.rowconfigure(1, weight=1)
        self._build_dev_card(body).grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        self._build_fwd_card(body).grid(row=0, column=1, sticky="nsew", padx=(8, 0))
        self._build_log_card(body).grid(row=1, column=0, columnspan=2, sticky="nsew", pady=(16, 0))

        root.bind("<Control-l>", lambda _e: self.clear_log())

        self.append(f"Repo: {REPO}", "sys")
        self.set_tunnel_state("off")
        self.refresh_buttons()
        self.root.after(100, self.drain_log)
        self.root.after(300, self.poll_ports)

    # ---------- dung giao dien ----------
    def _card(self, parent, title: str, subtitle: str) -> tuple[tk.Frame, tk.Frame, tk.Frame]:
        card = tk.Frame(parent, bg=C["card"], highlightthickness=1, highlightbackground=C["border"])
        head = tk.Frame(card, bg=C["card"], padx=18)
        head.pack(fill=tk.X, pady=(14, 0))
        tk.Label(head, text=title, font=self.f["card_title"], bg=C["card"], fg=C["text"]).pack(side=tk.LEFT)
        tk.Label(head, text=subtitle, font=self.f["small"], bg=C["card"], fg=C["faint"]).pack(
            side=tk.LEFT, padx=(8, 0), pady=(2, 0))
        content = tk.Frame(card, bg=C["card"], padx=18)
        content.pack(fill=tk.BOTH, expand=True, pady=(10, 16))
        return card, head, content

    def _button(self, parent, text, icon, command, variant="secondary") -> FlatButton:
        return FlatButton(parent, text, icon, command, variant, self.f)

    def _build_footer(self) -> None:
        footer = tk.Frame(self.root, bg=C["card"], padx=18, pady=6)
        footer.pack(side=tk.BOTTOM, fill=tk.X)
        tk.Frame(self.root, bg=C["border"], height=1).pack(side=tk.BOTTOM, fill=tk.X)
        tk.Label(footer, text="Developed by ", font=self.f["small"], bg=C["card"], fg=C["muted"]).pack(side=tk.LEFT)
        tk.Label(footer, text=AUTHOR, font=self.f["small_bold"], bg=C["card"], fg=C["primary"]).pack(side=tk.LEFT)
        tk.Label(footer, text="Ctrl+L: xóa log", font=self.f["small"], bg=C["card"], fg=C["faint"]).pack(side=tk.RIGHT)
        self.footer = footer

    def _build_header(self) -> None:
        header = tk.Frame(self.root, bg=C["card"], padx=18, pady=12)
        header.pack(fill=tk.X)
        tk.Frame(self.root, bg=C["border"], height=1).pack(fill=tk.X)

        self.logo = self._load_logo(36)
        if self.logo:
            tk.Label(header, image=self.logo, bg=C["card"]).pack(side=tk.LEFT, padx=(0, 12))
        titles = tk.Frame(header, bg=C["card"])
        titles.pack(side=tk.LEFT)
        tk.Label(titles, text=APP_NAME, font=self.f["title"], bg=C["card"], fg=C["text"]).pack(anchor="w")
        tk.Label(titles, text=str(REPO), font=self.f["subtitle"], bg=C["card"], fg=C["muted"]).pack(anchor="w")

        self.pill_overall = Pill(header, self.f)
        self.pill_overall.configure(bg=C["card"])
        self.pill_overall.pack(side=tk.RIGHT)

    def _load_logo(self, size: int):
        png = HERE / "app.png"
        if not png.exists():
            return None
        try:
            from PIL import Image, ImageTk  # net hon subsample, nhung khong bat buoc
            return ImageTk.PhotoImage(Image.open(png).resize((size, size), Image.LANCZOS))
        except Exception:
            img = tk.PhotoImage(file=str(png))
            return img.subsample(max(1, img.width() // size))

    def _build_dev_card(self, parent) -> tk.Frame:
        card, _head, content = self._card(parent, "Dev server", "npm start")
        pills = tk.Frame(content, bg=C["card"])
        pills.pack(fill=tk.X)
        self.pill_server = Pill(pills, self.f)
        self.pill_client = Pill(pills, self.f)
        self.pill_server.pack(side=tk.LEFT, padx=(0, 8))
        self.pill_client.pack(side=tk.LEFT)

        desc = tk.Label(content, text="Server API :3000 và giao diện Vite :5173. Sửa code server thì Stop → Start.",
                        font=self.f["small"], bg=C["card"], fg=C["muted"], anchor="w", justify=tk.LEFT,
                        wraplength=400)
        desc.pack(fill=tk.X, pady=(12, 14))
        desc.bind("<Configure>", lambda e: desc.configure(wraplength=max(e.width - 4, 100)))

        btns = tk.Frame(content, bg=C["card"])
        btns.pack(fill=tk.X, side=tk.BOTTOM)
        self.btn_start = self._button(btns, "Start", ICON["play"], self.start, "primary")
        self.btn_stop = self._button(btns, "Stop", ICON["stop"], self.stop)
        self.btn_open = self._button(btns, "Mở app", ICON["open"], self.open_browser)
        for b in (self.btn_start, self.btn_stop, self.btn_open):
            b.pack(side=tk.LEFT, padx=(0, 8))
        return card

    def _build_fwd_card(self, parent) -> tk.Frame:
        card, head, content = self._card(parent, "Port forward", "devtunnel · private")
        self.btn_login = self._button(head, "Đăng nhập", ICON["user"], self.tunnel_login_clicked, "ghost")
        self.btn_login.pack(side=tk.RIGHT)

        row = tk.Frame(content, bg=C["card"])
        row.pack(fill=tk.X)
        self.pill_tunnel = Pill(row, self.f)
        self.pill_tunnel.pack(side=tk.LEFT)

        field = tk.Frame(content, bg=C["border"], padx=1, pady=1)
        field.pack(fill=tk.X, pady=(12, 14))
        inner = tk.Frame(field, bg=C["field"], padx=10, pady=7)
        inner.pack(fill=tk.X)
        tk.Label(inner, text=ICON["lock"], font=self.f["icon"], bg=C["field"], fg=C["faint"]).pack(
            side=tk.LEFT, padx=(0, 8))
        self.lbl_url = tk.Label(inner, font=self.f["url"], bg=C["field"], anchor="w")
        self.lbl_url.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.lbl_url.bind("<Button-1>", lambda _e: self.tunnel_url and webbrowser.open(self.tunnel_url))

        btns = tk.Frame(content, bg=C["card"])
        btns.pack(fill=tk.X, side=tk.BOTTOM)
        self.btn_fwd = self._button(btns, f"Forward :{CLIENT_PORT}", ICON["globe"], self.tunnel_toggle, "primary")
        self.btn_copy = self._button(btns, "Copy link", ICON["copy"], self.copy_tunnel_url)
        self.btn_qr = self._button(btns, "QR", ICON["qr"], self.show_qr)
        for b in (self.btn_fwd, self.btn_copy, self.btn_qr):
            b.pack(side=tk.LEFT, padx=(0, 8))
        return card

    def _build_log_card(self, parent) -> tk.Frame:
        card, head, content = self._card(parent, "Log", "server · client · tunnel")
        self.btn_clear = self._button(head, "Xóa log", ICON["clear"], self.clear_log, "ghost")
        self.btn_clear.pack(side=tk.RIGHT)
        content.pack_configure(pady=(10, 18))

        wrap = tk.Frame(content, bg=C["log_bg"])
        wrap.pack(fill=tk.BOTH, expand=True)
        sb = tk.Scrollbar(wrap, orient=tk.VERTICAL)
        sb.pack(side=tk.RIGHT, fill=tk.Y)
        self.log = tk.Text(
            wrap, wrap=tk.WORD, font=self.f["mono"], bg=C["log_bg"], fg=C["log_fg"],
            insertbackground=C["log_fg"], relief=tk.FLAT, bd=0, padx=14, pady=10,
            spacing1=1, spacing3=1, state=tk.DISABLED, yscrollcommand=sb.set,
            selectbackground="#264f78", selectforeground="#ffffff",
        )
        self.log.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        sb.configure(command=self.log.yview)
        for tag, color in {
            "sys": "#7d8590", "err": "#ff7b72", "server": "#79c0ff",
            "client": "#7ee787", "tunnel": "#d2a8ff", "url": "#f0b8d4",
        }.items():
            self.log.tag_configure(tag, foreground=color)
        return card

    # ---------- log ----------
    def append(self, text: str, tag: str | None = None) -> None:
        self.log.configure(state=tk.NORMAL)
        if tag:
            self.log.insert(tk.END, text + "\n", tag)
        else:
            # to mau tien to [server]/[client]/[tunnel]; dong co loi to do
            m = re.match(r"\[(server|client|tunnel)\]\s?", text)
            rest_tag = ("err",) if ERROR_RE.search(text) else ()
            if m:
                self.log.insert(tk.END, m.group(0), m.group(1))
                self.log.insert(tk.END, text[m.end():] + "\n", rest_tag)
            else:
                self.log.insert(tk.END, text + "\n", rest_tag)
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
                if isinstance(item, tuple):  # (TUNNEL_EXIT, proc)
                    self.on_tunnel_exit(item[1])
                    continue
                if item.startswith("[tunnel]"):
                    self.on_tunnel_line(item)
                else:
                    m = VITE_URL_RE.search(item)
                    if m:
                        self.client_url = m.group(1).rstrip("/")
                self.append(item)
        except queue.Empty:
            pass
        self.root.after(100, self.drain_log)

    def reader(self, proc: subprocess.Popen[bytes], prefix: str = "", exit_marker=None) -> None:
        assert proc.stdout is not None
        for raw in iter(proc.stdout.readline, b""):
            self.log_q.put(prefix + ANSI_RE.sub("", raw.decode("utf-8", errors="replace").rstrip()))
        proc.stdout.close()
        proc.wait()
        self.log_q.put(exit_marker)

    # ---------- trang thai ----------
    def running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def refresh_buttons(self) -> None:
        run = self.running()
        self.btn_start.set_enabled(not run and not self.busy)
        self.btn_stop.set_enabled(not self.busy)
        self.btn_open.set_enabled(self.port_state[CLIENT_PORT])
        fwd_on = self.tunnel_state != "off"
        self.btn_fwd.set(
            text="Dừng forward" if fwd_on else f"Forward :{CLIENT_PORT}",
            icon=ICON["cancel"] if fwd_on else ICON["globe"],
            variant="secondary" if fwd_on else "primary",
        )
        self.btn_fwd.set_enabled(fwd_on or (self.port_state[CLIENT_PORT] and not self.busy))
        self.btn_login.set_enabled(self.tunnel_state != "connecting")
        self.btn_copy.set_enabled(bool(self.tunnel_url))
        self.btn_qr.set_enabled(bool(self.tunnel_url))
        self.refresh_pills()

    def refresh_pills(self) -> None:
        run = self.running()
        for pill, port, name in ((self.pill_server, SERVER_PORT, "Server"), (self.pill_client, CLIENT_PORT, "Client")):
            if self.port_state[port]:
                pill.set("on", f"{name} :{port}")
            elif self.busy:
                pill.set("wait", f"{name} · đang tắt")
            elif run:
                pill.set("wait", f"{name} · đang khởi động")
            else:
                pill.set("off", f"{name} · tắt")
        if self.busy:
            self.pill_overall.set("wait", "Đang dừng...")
        elif all(self.port_state.values()):
            self.pill_overall.set("on", "Đang chạy" + (" · đang forward" if self.tunnel_state == "on" else ""))
        elif run:
            self.pill_overall.set("wait", "Đang khởi động...")
        elif any(self.port_state.values()):
            self.pill_overall.set("err", "Chạy dở (bấm Stop để dọn)")
        else:
            self.pill_overall.set("off", "Đã dừng")

    def poll_ports(self) -> None:
        def work() -> None:
            state = {p: port_open(p) for p in (SERVER_PORT, CLIENT_PORT)}
            self.root.after(0, lambda: self.apply_ports(state))

        threading.Thread(target=work, daemon=True).start()

    def apply_ports(self, state: dict[int, bool]) -> None:
        self.port_state = state
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
        self.stop_tunnel()  # app tat thi link cung phai chet
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

    # ---------- port forward ----------
    def set_tunnel_state(self, state: str, url: str = "") -> None:
        self.tunnel_state = state
        self.tunnel_url = url if state == "on" else ""
        pill = {"off": ("off", "Chưa forward"), "connecting": ("wait", "Đang kết nối..."),
                "on": ("on", f"Đang forward :{CLIENT_PORT}")}[state]
        self.pill_tunnel.set(*pill)
        if self.tunnel_url:
            self.lbl_url.configure(text=self.tunnel_url, fg=C["link"], cursor="hand2")
        else:
            hint = "Đang tạo link..." if state == "connecting" else "Bấm Forward để lấy link truy cập từ xa"
            self.lbl_url.configure(text=hint, fg=C["faint"], cursor="arrow")
        if state != "on" and self.qr_win is not None:
            self.close_qr()
        self.refresh_buttons()

    def tunnel_running(self) -> bool:
        return self.tunnel_proc is not None and self.tunnel_proc.poll() is None

    def need_devtunnel(self) -> str | None:
        exe = find_devtunnel()
        if not exe:
            messagebox.showinfo(
                APP_NAME,
                "Chưa cài devtunnel (Microsoft Dev Tunnels CLI).\n\n"
                "Mở PowerShell chạy:\n    winget install Microsoft.devtunnel\n\n"
                "rồi mở lại launcher.",
            )
        return exe

    def tunnel_toggle(self) -> None:
        if self.tunnel_state != "off":
            self.stop_tunnel()
            return
        exe = self.need_devtunnel()
        if not exe:
            return
        self.set_tunnel_state("connecting")
        threading.Thread(target=self._tunnel_prepare, args=(exe,), daemon=True).start()

    def _tunnel_prepare(self, exe: str) -> None:
        """Thread nen: kiem tra login -> dam bao co tunnel ben -> host."""
        code, out = run_cli([exe, "user", "show"])
        if code != 0 or "not logged in" in out.lower():
            self.root.after(0, lambda: self._ask_login_then_forward(exe))
            return
        tid, err = self._ensure_tunnel(exe)
        if err:
            self.root.after(0, lambda: self._tunnel_fail(err))
            return
        self.root.after(0, lambda: self._host_tunnel(exe, tid))

    def _ensure_tunnel(self, exe: str) -> tuple[str, str]:
        """Dung lai tunnel da tao (de link khong doi, giong VS Code); khong co/het han thi tao moi."""
        tid = ""
        try:
            tid = json.loads(TUNNEL_FILE.read_text(encoding="utf-8")).get("id", "")
        except (OSError, ValueError, AttributeError):
            pass
        if tid:
            code, out = run_cli([exe, "show", tid])
            if code == 0:
                return tid, ""
            if "not found" not in out.lower():
                return "", f"devtunnel show lỗi: {out.strip()[:300]}"
            self.log_q.put("[tunnel] Tunnel cũ không còn (hết hạn), tạo tunnel mới...")
        code, out = run_cli([exe, "create"])
        m = TUNNEL_ID_RE.search(out)
        if code != 0 or not m:
            return "", f"devtunnel create lỗi: {out.strip()[:300]}"
        tid = m.group(1)
        code, out = run_cli([exe, "port", "create", tid, "-p", str(CLIENT_PORT)])
        if code != 0 and "conflict" not in out.lower():
            return "", f"devtunnel port create lỗi: {out.strip()[:300]}"
        try:
            TUNNEL_FILE.write_text(json.dumps({"id": tid}), encoding="utf-8")
        except OSError:
            pass  # khong luu duoc thi lan sau tao tunnel moi, van chay duoc
        self.log_q.put(f"[tunnel] Đã tạo tunnel {tid}")
        return tid, ""

    def _host_tunnel(self, exe: str, tid: str) -> None:
        if self.tunnel_state != "connecting":  # user da bam Dung trong luc chuan bi
            return
        if not self.port_state[CLIENT_PORT]:
            self._tunnel_fail("Client :5173 chưa chạy, bấm Start trước.")
            return
        self.append(f"$ devtunnel host {tid}", "sys")
        try:
            # KHONG --allow-anonymous: tunnel private, chi tai khoan chu tunnel mo duoc
            proc = subprocess.Popen(
                [exe, "host", tid], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, creationflags=NO_WINDOW,
            )
        except OSError as e:
            self._tunnel_fail(f"Không chạy được devtunnel: {e}")
            return
        self.tunnel_proc = proc
        threading.Thread(target=self.reader, args=(proc, "[tunnel] ", (TUNNEL_EXIT, proc)), daemon=True).start()

    def on_tunnel_line(self, line: str) -> None:
        if "Connect via browser" not in line or self.tunnel_state == "off":
            return
        urls = [u.rstrip("/") for u in TUNNEL_URL_RE.findall(line)]
        if urls:
            url = next((u for u in urls if f"-{CLIENT_PORT}." in u), urls[0])
            self.set_tunnel_state("on", url)

    def on_tunnel_exit(self, proc: subprocess.Popen[bytes]) -> None:
        if proc is not self.tunnel_proc:
            return  # proc cu, da duoc thay
        self.tunnel_proc = None
        if self.tunnel_state != "off":
            self.append(f"[tunnel] devtunnel host đã dừng (exit code {proc.returncode})", "err")
            self.set_tunnel_state("off")

    def stop_tunnel(self) -> None:
        proc, self.tunnel_proc = self.tunnel_proc, None
        if proc is not None and proc.poll() is None:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           capture_output=True, creationflags=NO_WINDOW)
            self.append("[tunnel] Đã dừng forward", "sys")
        if self.tunnel_state != "off":
            self.set_tunnel_state("off")

    def _tunnel_fail(self, msg: str) -> None:
        self.append(f"[tunnel] {msg}", "err")
        self.set_tunnel_state("off")

    def _ask_login_then_forward(self, exe: str) -> None:
        if self.tunnel_state != "connecting":
            return
        if not messagebox.askyesno(APP_NAME, "Chưa đăng nhập devtunnel. Đăng nhập bây giờ?"):
            self.set_tunnel_state("off")
            return
        self.tunnel_login(exe, then=lambda: threading.Thread(
            target=self._tunnel_prepare, args=(exe,), daemon=True).start())

    def tunnel_login_clicked(self) -> None:
        exe = self.need_devtunnel()
        if exe:
            self.tunnel_login(exe)

    def tunnel_login(self, exe: str, then=None) -> None:
        ans = messagebox.askyesnocancel(
            APP_NAME, "Đăng nhập devtunnel bằng GitHub?\n\nYes = GitHub    No = Microsoft account")
        if ans is None:
            if then:
                self.set_tunnel_state("off")
            return
        args = [exe, "user", "login"] + (["-g"] if ans else [])
        self.append("$ devtunnel user login" + (" -g" if ans else "") + "  (làm tiếp trên trình duyệt)", "sys")

        def work() -> None:
            # token do devtunnel tu luu (Windows Credential Manager); launcher khong doc/ghi token
            code, _out = run_cli(args, timeout=300)
            ok = code == 0

            def done() -> None:
                self.append("[tunnel] Đăng nhập xong" if ok else "[tunnel] Đăng nhập lỗi hoặc hết thời gian chờ",
                            "sys" if ok else "err")
                if then and ok:
                    then()
                elif then:
                    self.set_tunnel_state("off")
            self.root.after(0, done)

        threading.Thread(target=work, daemon=True).start()

    def copy_tunnel_url(self) -> None:
        if self.tunnel_url:
            self.root.clipboard_clear()
            self.root.clipboard_append(self.tunnel_url)
            self.append(f"[tunnel] Đã copy {self.tunnel_url}", "sys")

    # ---------- QR ----------
    def show_qr(self) -> None:
        if not self.tunnel_url:
            return
        if self.qr_win is not None:
            self.qr_win.lift()
            self.qr_win.focus_force()
            return
        try:
            matrix = make_qr(self.tunnel_url)
        except ValueError as e:
            self.append(f"[tunnel] Không tạo được QR: {e}", "err")
            return

        win = tk.Toplevel(self.root, bg=C["card"], padx=28, pady=22)
        win.title("QR · Port forward")
        win.resizable(False, False)
        win.transient(self.root)
        self.qr_win = win
        win.protocol("WM_DELETE_WINDOW", self.close_qr)
        win.bind("<Escape>", lambda _e: self.close_qr())

        tk.Label(win, text="Quét để mở trên điện thoại", font=self.f["card_title"],
                 bg=C["card"], fg=C["text"]).pack()
        tk.Label(win, text="Điện thoại cần đăng nhập đúng tài khoản devtunnel của bạn",
                 font=self.f["small"], bg=C["card"], fg=C["muted"]).pack(pady=(2, 14))

        # ve QR: 1 pixel/module + le 4 module, roi phong to bang zoom (nhanh, net)
        border = 4
        n = len(matrix) + border * 2
        img = tk.PhotoImage(width=n, height=n)
        light, dark = "#ffffff", "#111827"
        rows = []
        for y in range(n):
            my = y - border
            row = []
            for x in range(n):
                mx = x - border
                on = 0 <= my < len(matrix) and 0 <= mx < len(matrix) and matrix[my][mx]
                row.append(dark if on else light)
            rows.append("{" + " ".join(row) + "}")
        img.put(" ".join(rows))
        scale = max(4, 300 // n)
        self.qr_img = img.zoom(scale)  # giu tham chieu, khong thi Tk xoa anh
        frame = tk.Frame(win, bg=C["border"], padx=1, pady=1)
        frame.pack()
        tk.Label(frame, image=self.qr_img, bg="#ffffff", bd=0).pack()

        tk.Label(win, text=self.tunnel_url, font=self.f["small_bold"], bg=C["card"], fg=C["link"],
                 wraplength=n * scale).pack(pady=(14, 14))
        btns = tk.Frame(win, bg=C["card"])
        btns.pack()
        self._button(btns, "Copy link", ICON["copy"], self.copy_tunnel_url, "primary").pack(side=tk.LEFT, padx=4)
        self._button(btns, "Đóng", "", self.close_qr).pack(side=tk.LEFT, padx=4)

        # canh giua tren cua so chinh
        win.update_idletasks()
        x = self.root.winfo_rootx() + (self.root.winfo_width() - win.winfo_width()) // 2
        y = self.root.winfo_rooty() + (self.root.winfo_height() - win.winfo_height()) // 2
        win.geometry(f"+{max(x, 0)}+{max(y, 0)}")
        win.focus_force()

    def close_qr(self) -> None:
        if self.qr_win is not None:
            self.qr_win.destroy()
            self.qr_win = None

    # ---------- dong cua so ----------
    def on_close(self) -> None:
        if not (self.running() or any(self.port_state.values())):
            self.stop_tunnel()
            self.root.destroy()
            return
        ans = messagebox.askyesnocancel(APP_NAME, "Dev server đang chạy. Tắt server rồi thoát?\n"
                                        "(No = thoát nhưng để server chạy tiếp)")
        if ans is None:
            return
        self.stop_tunnel()  # khong de link song khi launcher khong con quan ly
        if ans:
            self.root.title(f"{APP_NAME} - đang tắt...")
            self.run_kill(then=self.root.destroy)
        else:
            self.root.destroy()


def main() -> None:
    try:
        import ctypes
        # Tach khoi nhom "Python" tren taskbar -> taskbar hien icon rieng cua launcher
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ssi.thread-affiliate.launcher")
        # Chu net tren man hinh scale 125%/150% (khong thi Windows phong to anh bitmap -> mo)
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError, OSError):
        pass
    root = tk.Tk()
    Launcher(root)
    root.mainloop()


if __name__ == "__main__":
    main()
