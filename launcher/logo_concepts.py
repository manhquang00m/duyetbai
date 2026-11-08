"""5 phuong an logo Threads x affiliate Shopee de duyet -> launcher/logo-concepts/.

Chay:  python launcher/logo_concepts.py   (can Pillow)
CHI tao anh de chon, KHONG dung toi icon dang dung (app.ico, client/public/*).
Moi phuong an la thiet ke rieng, chi goi y bang y niem chung (soi chi, chuoi bai, chat, tui,
the gia, link, dong xu) - khong dung lai ky hieu cua Meta Threads hay Shopee.
"""
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

from make_icon import draw_icon as draw_current

OUT = Path(__file__).resolve().parent / "logo-concepts"
S = 1024
WHITE = (255, 255, 255, 255)
FONT_DIR = Path("C:/Windows/Fonts")


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size)


def grad(c1, c2, size: int = S, angle: float = -45) -> Image.Image:
    """Gradient cheo tu c1 (tren-trai) sang c2 (duoi-phai)."""
    band = Image.new("RGB", (size * 2, 1))
    for x in range(size * 2):
        t = x / (size * 2 - 1)
        band.putpixel((x, 0), tuple(round(a + (b - a) * t) for a, b in zip(c1, c2)))
    big = band.resize((size * 2, size * 2)).rotate(angle, resample=Image.BICUBIC)
    off = size // 2
    return big.crop((off, off, off + size, off + size)).convert("RGBA")


def tile_mask() -> Image.Image:
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle((32, 32, S - 32, S - 32), radius=230, fill=255)
    return m


def tile(fill) -> Image.Image:
    """O icon bo goc; fill = mau (tuple) hoac anh nen."""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    src = fill if isinstance(fill, Image.Image) else Image.new("RGBA", (S, S), fill)
    img.paste(src, (0, 0), tile_mask())
    return img


def densify(points, step: float = 2.0):
    """Chen diem doc polyline de 'dong dau' hinh tron lien mach."""
    out = []
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / step))
        out += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(n)]
    out.append(points[-1])
    return out


def stroke(d: ImageDraw.ImageDraw, points, w: float, fill) -> None:
    """Net tron dau, tron goc: dong dau hinh tron doc duong tam (khong co khe noi)."""
    for x, y in densify(points):
        d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=fill)


def arc_pts(cx, cy, r, a0, a1, n=120):
    """Diem tren cung tron, goc do (0 = phai, 90 = xuong duoi vi truc y huong xuong)."""
    return [
        (cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)))
        for i in range(n + 1)
    ]


def catmull(points, n=40):
    """Duong cong muot di qua cac diem (Catmull-Rom)."""
    pts = [points[0]] + points + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                       + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)
                for j in range(2)
            ))
    out.append(points[-1])
    return out


def punch(img: Image.Image, mask: Image.Image, src: Image.Image) -> None:
    """Dan src len img qua mask (vd khoet chu/lo de lo nen gradient)."""
    img.paste(src, (0, 0), ImageChops.multiply(mask, tile_mask()))


# ---------------------------------------------------------------- 1. Tui chi
def concept_bag() -> Image.Image:
    bg = grad((0xD1, 0x30, 0x7A), (0xFF, 0x8A, 0x3D))
    img = tile(bg)
    d = ImageDraw.Draw(img)
    # quai tui = soi chi: vong cung + 1 nut that nho tren dinh
    stroke(d, arc_pts(512, 430, 140, 180, 360), 54, WHITE)
    stroke(d, arc_pts(512, 252, 42, 90, 450), 30, WHITE)
    # than tui (hinh thang bo goc nhe)
    body = Image.new("L", (S, S), 0)
    ImageDraw.Draw(body).rounded_rectangle((262, 410, 762, 812), radius=72, fill=255)
    img.paste(Image.new("RGBA", (S, S), WHITE), (0, 0), body)
    # ky hieu dong (khoet mau nen) - tien hoa hong
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).text((512, 600), "₫", font=font("segoeuib.ttf", 250), fill=255, anchor="mm")
    punch(img, m, bg)
    return img


# ---------------------------------------------------------------- 2. Chat-tag
def concept_chat_tag() -> Image.Image:
    bg = grad((0xFF, 0x9A, 0x3C), (0xE8, 0x38, 0x4F))
    img = tile(bg)
    d = ImageDraw.Draw(img)
    # soi day xo the gia, vat ra goc tren-trai
    stroke(d, catmull([(372, 392), (300, 300), (210, 270), (150, 210)]), 22, WHITE)
    # bong bong chat (than + duoi) = the gia
    shape = Image.new("L", (S, S), 0)
    sd = ImageDraw.Draw(shape)
    sd.rounded_rectangle((262, 300, 790, 668), radius=120, fill=255)
    sd.polygon([(340, 620), (300, 792), (470, 660)], fill=255)
    img.paste(Image.new("RGBA", (S, S), WHITE), (0, 0), shape)
    # lo xo day + dau % (hoa hong) khoet mau nen
    m = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(m)
    md.ellipse((372 - 36, 392 - 36, 372 + 36, 392 + 36), fill=255)
    md.text((560, 500), "%", font=font("seguibl.ttf", 300), fill=255, anchor="mm")
    punch(img, m, bg)
    return img


# ---------------------------------------------------------------- 3. Chuoi bai
def concept_thread_posts() -> Image.Image:
    img = tile((0x12, 0x12, 0x16, 255))
    d = ImageDraw.Draw(img)
    # vien mong de o den van tach khoi nen toi (taskbar, dark mode)
    d.rounded_rectangle((32, 32, S - 32, S - 32), radius=230, outline=(0x3A, 0x3A, 0x44, 255), width=10)
    orange = (0xFF, 0x7A, 0x2F, 255)
    x, ys = 352, (300, 512, 724)
    stroke(d, [(x, ys[0]), (x, ys[2])], 30, WHITE)  # soi chi noi cac bai
    for y in ys[:2]:
        d.ellipse((x - 62, y - 62, x + 62, y + 62), fill=WHITE)
    # nut cuoi = dong xu cam
    d.ellipse((x - 70, ys[2] - 70, x + 70, ys[2] + 70), fill=orange)
    d.ellipse((x - 26, ys[2] - 26, x + 26, ys[2] + 26), fill=(0x12, 0x12, 0x16, 255))
    # dong noi dung moi bai
    for y, end, col in ((ys[0], 780, WHITE), (ys[1], 720, WHITE), (ys[2], 650, orange)):
        d.rounded_rectangle((456, y - 30, end, y + 30), radius=30, fill=col)
    return img


# ---------------------------------------------------------------- 4. Tang truong
def concept_growth() -> Image.Image:
    img = tile(grad((0x6D, 0x4A, 0xFF), (0xE8, 0x40, 0x7A)))
    d = ImageDraw.Draw(img)
    w = 70
    curve = catmull([(330, 720), (420, 600), (520, 650), (610, 480), (700, 430), (770, 300)])
    stroke(d, curve, w, WHITE)
    # dau mui ten theo huong cuoi duong cong
    (x0, y0), (x1, y1) = curve[-6], curve[-1]
    ang = math.atan2(y1 - y0, x1 - x0)
    for side in (-1, 1):
        a = ang + math.pi + side * math.radians(38)
        stroke(d, [(x1, y1), (x1 + 150 * math.cos(a), y1 + 150 * math.sin(a))], w, WHITE)
    # dong xu o dau soi
    coin = (262, 776)
    d.ellipse((coin[0] - 92, coin[1] - 92, coin[0] + 92, coin[1] + 92), fill=WHITE)
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).ellipse((coin[0] - 36, coin[1] - 36, coin[0] + 36, coin[1] + 36), fill=255)
    punch(img, m, grad((0x6D, 0x4A, 0xFF), (0xE8, 0x40, 0x7A)))
    return img


# ---------------------------------------------------------------- 5. Link vo tan
def concept_infinity_link() -> Image.Image:
    img = tile((255, 255, 255, 255))
    # vien mong de o trang khong chim vao nen trang
    edge = Image.new("L", (S, S), 0)
    ImageDraw.Draw(edge).rounded_rectangle((32, 32, S - 32, S - 32), radius=230, outline=255, width=6)
    img.paste(Image.new("RGBA", (S, S), (0xE6, 0xE6, 0xEA, 255)), (0, 0), edge)

    a, w, cx, cy = 360, 96, 512, 512

    def lem(t):  # lemniscate Bernoulli: hai vong chi giao nhau o tam
        s = 1 + math.sin(t) ** 2
        return cx + a * math.cos(t) / s, cy + a * math.sin(t) * math.cos(t) / s

    full = [lem(2 * math.pi * i / 720) for i in range(721)]
    m = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(m)
    stroke(md, full, w, 255)
    # dan cheo tai tam (2 nhanh qua tam o t = pi/2 va 3pi/2): cat khe nhanh 3pi/2, ve de nhanh pi/2
    # len tren -> nhu 2 vong chi long vao nhau
    stroke(md, [lem(1.5 * math.pi + (k - 20) / 80) for k in range(41)], w + 56, 0)
    stroke(md, [lem(0.5 * math.pi + (k - 26) / 80) for k in range(53)], w, 255)
    img.paste(grad((0xFF, 0x8A, 0x3D), (0xD1, 0x30, 0x7A)), (0, 0), m)
    return img


CONCEPTS = [
    ("0", "Hiện tại — chữ T sợi chỉ + túi cam S", draw_current),
    ("1", "Túi chỉ — quai túi là sợi chỉ, tiền ₫", concept_bag),
    ("2", "Chat-tag — bong bóng chat + thẻ giá %", concept_chat_tag),
    ("3", "Chuỗi bài — chuỗi bài nối, cuối là đồng xu", concept_thread_posts),
    ("4", "Tăng trưởng — sợi chỉ thành mũi tên đi lên", concept_growth),
    ("5", "Link vô tận — hai vòng chỉ đan thành mắt xích", concept_infinity_link),
]


def contact_sheet(images) -> Image.Image:
    row_h, W = 300, 1180
    sheet = Image.new("RGB", (W, 70 + row_h * len(images)), (246, 247, 249))
    d = ImageDraw.Draw(sheet)
    d.text((30, 22), "Logo Threads × affiliate Shopee — phương án để duyệt", font=font("segoeuib.ttf", 26), fill=(17, 24, 39))
    for i, ((num, label, _), img) in enumerate(zip(CONCEPTS, images)):
        y = 70 + i * row_h
        d.rounded_rectangle((16, y + 8, W - 16, y + row_h - 8), radius=16, fill=(255, 255, 255), outline=(229, 231, 235))
        d.text((40, y + 26), f"{num}", font=font("segoeuib.ttf", 30), fill=(209, 48, 122))
        d.text((80, y + 30), label, font=font("segoeui.ttf", 22), fill=(17, 24, 39))
        big = img.resize((200, 200), Image.LANCZOS)
        sheet.paste(big, (40, y + 76), big)
        # cac co nho (giong favicon tren tab / icon app)
        x = 290
        for size in (96, 64, 32, 16):
            sm = img.resize((size, size), Image.LANCZOS)
            sheet.paste(sm, (x, y + 176 - size // 2), sm)
            d.text((x + size // 2, y + 250), f"{size}px", font=font("segoeui.ttf", 15), fill=(107, 114, 128), anchor="mm")
            x += size + 42
        # tren nen toi (taskbar / dark mode)
        dark = (x + 10, y + 76, x + 420, y + 276)
        d.rounded_rectangle(dark, radius=14, fill=(24, 26, 33))
        dk = img.resize((128, 128), Image.LANCZOS)
        sheet.paste(dk, (dark[0] + 30, y + 112), dk)
        for j, size in enumerate((48, 32, 16)):
            sm = img.resize((size, size), Image.LANCZOS)
            sx = dark[0] + 200 + j * 70
            sheet.paste(sm, (sx, y + 176 - size // 2), sm)
        d.text(((dark[0] + dark[2]) // 2, y + 258), "nền tối", font=font("segoeui.ttf", 14), fill=(156, 163, 175), anchor="mm")
    return sheet


def main() -> None:
    OUT.mkdir(exist_ok=True)
    images = []
    for num, label, fn in CONCEPTS:
        img = fn()
        images.append(img)
        name = "concept-0-current.png" if num == "0" else f"concept-{num}.png"
        img.resize((512, 512), Image.LANCZOS).save(OUT / name, optimize=True)
    contact_sheet(images).save(OUT / "sheet.png", optimize=True)
    print("Da ghi", OUT)


if __name__ == "__main__":
    main()
