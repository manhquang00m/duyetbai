"""Ve icon cho Thread Affiliate: launcher (app.ico/app.png) + web (favicon, icon PWA).

Chay lai khi muon doi mau/hinh:  python launcher/make_icon.py   (can Pillow)
Thiet ke: o vuong bo tron gradient hong (mau --primary cua client) -> cam,
chu "T" trang co than cong thanh soi chi (Threads), soi chi chay vao tui cam chu S vien trang
(affiliate Shopee). Luu y: tui cam chu S la nhan dien cua Shopee - chi dung cho tool noi bo.

File ghi ra:
  launcher/app.ico, launcher/app.png         icon launcher (o bo tron, nen trong suot)
  client/public/favicon.ico                  icon tab trinh duyet (16/32/48)
  client/public/icons/icon-192.png, -512     icon PWA "any" (o bo tron)
  client/public/icons/maskable-512.png       icon PWA "maskable": nen tran vien, chu nam trong vung an toan
  client/public/icons/apple-touch-icon.png   iOS (180, nen tran vien, iOS tu bo goc)
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
WEB = OUT.parent / "client" / "public"
S = 1024  # ve to roi thu nho de khu rang cua
TOP_LEFT = (0xD1, 0x30, 0x7A)  # --primary cua client
BOTTOM_RIGHT = (0xFF, 0x8A, 0x3D)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)
SHOPEE_ORANGE = (0xEE, 0x4D, 0x2D, 255)
FONT_BLACK = r"C:\Windows\Fonts\seguibl.ttf"  # Segoe UI Black - chu S tren tui


def gradient(size: int) -> Image.Image:
    # gradient cheo: ve 1 dai ngang roi xoay 45 do cho nhanh
    band = Image.new("RGB", (size * 2, 1))
    for x in range(size * 2):
        t = x / (size * 2 - 1)
        band.putpixel((x, 0), tuple(round(a + (b - a) * t) for a, b in zip(TOP_LEFT, BOTTOM_RIGHT)))
    big = band.resize((size * 2, size * 2)).rotate(-45, resample=Image.BICUBIC)
    off = size // 2
    return big.crop((off, off, off + size, off + size)).convert("RGBA")


def _stamp(d: ImageDraw.ImageDraw, pts, w: float, fill=WHITE) -> None:
    """Net tron dau: dong dau hinh tron doc duong tam -> lien mach, khong khe noi."""
    dense = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / 2))
        dense += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(n)]
    dense.append(pts[-1])
    for x, y in dense:
        d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=fill)


def _arc(cx, cy, r, a0, a1, n=160):
    """Diem tren cung tron, goc do (0 = phai, 90 = xuong vi truc y huong xuong)."""
    return [
        (cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)))
        for i in range(n + 1)
    ]


def _bag(img: Image.Image, cx: float, top: float, bw: float, bh: float) -> None:
    """Tui cam chu S, vien trang kieu sticker de tach khoi goc cam cua gradient; quai = soi chi trang."""
    d = ImageDraw.Draw(img)
    rim = 30
    _stamp(d, _arc(cx, top - rim * 0.4, bw * 0.33, 180, 360), 42)  # quai mong, rong -> ra tui, khong ra o khoa
    d.rounded_rectangle((cx - bw / 2 - rim, top - rim, cx + bw / 2 + rim, top + bh + rim), radius=bw * 0.26 + rim, fill=WHITE)
    d.rounded_rectangle((cx - bw / 2, top, cx + bw / 2, top + bh), radius=bw * 0.26, fill=SHOPEE_ORANGE)
    d.text((cx, top + bh * 0.53), "S", font=ImageFont.truetype(FONT_BLACK, int(bh * 0.86)), fill=WHITE, anchor="mm")


def draw_glyph() -> Image.Image:
    """Chu T + soi chi chay vao tui cam chu S, tren nen trong suot (toa do goc, chua can giua)."""
    img = Image.new("RGBA", (S, S), CLEAR)
    d = ImageDraw.Draw(img)
    w = 124  # do day net chi
    d.rounded_rectangle((250, 236, 774, 236 + w), radius=w // 2, fill=WHITE)  # thanh ngang chu T
    # than chu T cong xuong roi chay sang phai, dau soi cham mep tui
    r, cx, cy = 150, 662, 560
    path = [(512, y) for y in range(300, cy + 1, 2)] + _arc(cx, cy, r, 180, 90) + [(cx + 30, cy + r)]
    _stamp(d, path, w)
    _bag(img, 852, 588, 270, 240)
    return img


def _fit(glyph: Image.Image, frac: float, bg: Image.Image) -> Image.Image:
    """Thu/phong cum hinh de canh dai nhat = frac * S, dat giua nen (lech xuong 6px cho can thi giac)."""
    l, t, r, b = glyph.getbbox()
    crop = glyph.crop((l, t, r, b))
    k = frac * S / max(r - l, b - t)
    crop = crop.resize((round((r - l) * k), round((b - t) * k)), Image.LANCZOS)
    out = bg.copy()
    out.alpha_composite(crop, ((S - crop.width) // 2, (S - crop.height) // 2 + 6))
    return out


def draw_icon() -> Image.Image:
    """Icon chuan: o bo tron (goc trong suot) + cum hinh can giua."""
    tile_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(tile_mask).rounded_rectangle((32, 32, S - 32, S - 32), radius=230, fill=255)
    tile = Image.new("RGBA", (S, S), CLEAR)
    tile.paste(gradient(S), (0, 0), tile_mask)
    return _fit(draw_glyph(), 0.70, tile)


def draw_full_bleed(frac: float) -> Image.Image:
    """Nen gradient phu kin o vuong (khong bo goc) + cum hinh nho hon. Dung cho maskable
    (Android cat thanh tron/squircle - phai nam trong vong tron 80%) va iOS (tu bo goc)."""
    return _fit(draw_glyph(), frac, gradient(S))


def main() -> None:
    icon = draw_icon()
    icon.resize((256, 256), Image.LANCZOS).save(OUT / "app.png")
    icon.save(OUT / "app.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("Da ghi", OUT / "app.ico")

    icons = WEB / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    icon.save(WEB / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    for size in (192, 512):
        icon.resize((size, size), Image.LANCZOS).save(icons / f"icon-{size}.png", optimize=True)
    # Vung an toan cua maskable = hinh tron duong kinh 80% -> cum hinh chiem ~58% la vua
    draw_full_bleed(0.58).resize((512, 512), Image.LANCZOS).save(icons / "maskable-512.png", optimize=True)
    draw_full_bleed(0.66).convert("RGB").resize((180, 180), Image.LANCZOS).save(
        icons / "apple-touch-icon.png", optimize=True
    )
    print("Da ghi icon web vao", WEB)


if __name__ == "__main__":
    main()
