# Threads Downloader

Tool tải media (ảnh/video), caption và comment từ bài viết Threads theo danh sách URL, có UI quản lý (batch, bài viết, account, proxy) và xuất dữ liệu ra Excel (kể cả import/export sang Shopee).

## Kiến trúc

- `server/` — Node.js (TypeScript) + Express, dùng Playwright để crawl Threads, SQLite (`node:sqlite`) làm DB, lưu media vào `downloads/`.
- `client/` — React 19 + Vite + Tailwind, giao diện quản lý batch/bài viết/account/proxy.
- `urls.txt` — danh sách URL bài Threads cần crawl, mỗi dòng 1 URL (dòng bắt đầu bằng `#` bị bỏ qua).

## Yêu cầu

- Node.js 22+ (cần `--experimental-sqlite`, đã cấu hình sẵn trong script).
- Trong mạng SSI: cấu hình `HTTPS_PROXY` để Node ra được internet (xem `server/.env.example`).

## Cài đặt

```bash
npm install
```

(dùng npm workspaces, cài chung cho cả `server` và `client`)

Tạo file môi trường cho server:

```bash
cp server/.env.example server/.env
```

Sửa `server/.env`:
- `HTTPS_PROXY` — proxy ra internet (bỏ trống nếu mạng không cần proxy). **Không commit file `.env`.**
- `PORT` — cổng chạy server (mặc định `3000`).

## Chạy project

Chạy cả server và client cùng lúc:

```bash
npm run dev
```

- Server: http://localhost:3000
- Client (Vite dev server): xem log console, thường là http://localhost:5173

### Launcher GUI (không cần mở VS Code)

`launcher/duyetbai_launcher.pyw` — cửa sổ "Thread Affiliate Launcher" (tkinter), chạy `npm start` (server không watch), có Start / Stop / Mở trình duyệt, hiện log server + client, tự mở browser khi Vite lên. Stop dùng lại `scripts/kill-dev.mjs`.

Tạo shortcut trên Desktop (chạy 1 lần):

```powershell
powershell -ExecutionPolicy Bypass -File launcher\create_shortcut.ps1
```

**Port forward ra internet** (giống Ports → Forward của VS Code, dùng Microsoft Dev Tunnels):

1. Cài 1 lần: `winget install Microsoft.devtunnel`
2. Launcher → Start → bấm `Forward :5173` (lần đầu sẽ hỏi đăng nhập GitHub/Microsoft).
3. Link `https://<id>-5173.<region>.devtunnels.ms` hiện trên launcher, bấm `Copy link`. Link giữ nguyên giữa các lần (id lưu ở `launcher/.tunnel.json`, không commit).

Tunnel luôn **private**: ai mở link cũng phải đăng nhập đúng tài khoản devtunnel của bạn. App không có đăng nhập riêng nên không chuyển tunnel sang public. Stop server hoặc đóng launcher là tunnel tắt theo. Trên máy/mạng SSI cần security@ssi.com.vn duyệt trước khi dùng devtunnel.

Chạy riêng từng phần:

```bash
npm run dev:server
npm run dev:client
```

## Các lệnh khác (chạy trong `server/`)

| Lệnh | Mục đích |
| --- | --- |
| `npm run batch` | Crawl toàn bộ URL trong `urls.txt` (batch, không qua UI) |
| `npm run db:show` | Xem nhanh dữ liệu trong SQLite DB |
| `npm run account:add` | Thêm account theo dõi |
| `npm run export:posts` | Xuất bài viết đã crawl ra Excel |
| `npm run export:shopee` | Xuất dữ liệu sang định dạng Shopee |
| `npm run import:shopee` | Import dữ liệu từ file Shopee |
| `npm run test:media` / `test:download` / `test:comments` / `test:proxy` / `test:http` | Script test từng phần (lấy media, tải file, lấy comment, kiểm tra proxy, gọi HTTP thô) |
| `npm run typecheck` | Kiểm tra type TypeScript |

## Dữ liệu & thư mục output (mặc định, đổi được qua `.env`)

- `data/threads.db` — SQLite DB
- `downloads/` — media đã tải về
- `exports/` — file Excel xuất ra
- `accounts.txt` — danh sách account theo dõi

## Lưu ý an toàn

- Không commit file `.env`, thông tin proxy có user/pass, hoặc dữ liệu cá nhân của account Threads.
- Dữ liệu crawl có thể chứa nội dung công khai của người dùng khác — chỉ dùng cho mục đích nội bộ, tuân thủ chính sách của Threads/Meta và quy định bảo vệ dữ liệu cá nhân hiện hành.
