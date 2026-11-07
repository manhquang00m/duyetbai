"""Ve icon cho Thread Affiliate Launcher -> launcher/app.ico (+ app.png de xem truoc).

Chay lai khi muon doi mau/hinh:  python launcher/make_icon.py   (can Pillow)
Thiet ke: o vuong bo tron gradient hong (mau --primary cua client) -> cam,
chu "T" trang co than cong thanh soi chi, dau soi la mot "dong xu" nho (affiliate).
"""
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

OUT = Path(__file__).resolve().parent
S = 1024  # ve to roi thu nho de khu rang cua
TOP_LEFT = (0xD1, 0x30, 0x7A)  # --primary cua client
BOTTOM_RIGHT = (0xFF, 0x8A, 0x3D)
WHITE = (255, 255, 255, 255)


def gradient(size: int) -> Image.Image:
    # gradient cheo: ve 1 dai ngang roi xoay 45 do cho nhanh
    band = Image.new("RGB", (size * 2, 1))
    for x in range(size * 2):
        t = x / (size * 2 - 1)
        band.putpixel((x, 0), tuple(round(a + (b - a) * t) for a, b in zip(TOP_LEFT, BOTTOM_RIGHT)))
    big = band.resize((size * 2, size * 2)).rotate(-45, resample=Image.BICUBIC)
    off = size // 2
    return big.crop((off, off, off + size, off + size)).convert("RGBA")


def draw_icon() -> Image.Image:
    tile_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(tile_mask).rounded_rectangle((32, 32, S - 32, S - 32), radius=230, fill=255)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(gradient(S), (0, 0), tile_mask)

    d = ImageDraw.Draw(img)
    w = 124  # do day net
    # thanh ngang chu T
    d.rounded_rectangle((250, 236, 774, 236 + w), radius=w // 2, fill=WHITE)
    # than chu T + soi chi cong sang phai: "dong dau" hinh tron doc theo duong tam
    # -> net lien, khong co khe noi giua doan thang va cung tron
    r = 150  # ban kinh cung cong
    cx, cy = 512 + r, 580
    path = [(512, y) for y in range(300, cy + 1, 2)]
    path += [(cx - r * math.cos(a / 100), cy + r * math.sin(a / 100)) for a in range(0, 158)]
    for x, y in path:
        d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=WHITE)
    # dong xu o cuoi soi (cach mot khe): vong tron trang, giua khoet lo thay gradient
    coin_c, coin_r = (cx + 172, cy + r), 84
    d.ellipse((coin_c[0] - coin_r, coin_c[1] - coin_r, coin_c[0] + coin_r, coin_c[1] + coin_r), fill=WHITE)
    hole = Image.new("L", (S, S), 0)
    hr = 38
    ImageDraw.Draw(hole).ellipse((coin_c[0] - hr, coin_c[1] - hr, coin_c[0] + hr, coin_c[1] + hr), fill=255)
    img.paste(gradient(S), (0, 0), ImageChops.multiply(hole, tile_mask))
    return img


def main() -> None:
    img = draw_icon()
    img.resize((256, 256), Image.LANCZOS).save(OUT / "app.png")
    img.save(OUT / "app.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("Da ghi", OUT / "app.ico")


if __name__ == "__main__":
    main()
