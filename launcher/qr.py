"""Tao ma QR thuan Python (khong can thu vien ngoai) cho launcher.

Chi ho tro nhung gi launcher can: che do byte (UTF-8), muc sua loi M, version 1-10
(du cho URL toi ~210 byte). Thuat toan theo ISO/IEC 18004, cau truc dua tren
"QR Code generator library" cua Project Nayuki (MIT).

    from qr import make_qr
    matrix = make_qr("https://...")   # list[list[bool]], True = o den, chua co le trang
"""
from __future__ import annotations

# Muc sua loi M, index = version (1..10). Kiem tra: tong data codeword v1..v10 =
# 16, 28, 44, 64, 86, 108, 124, 154, 182, 216 (khop bang chuan).
_ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
_NUM_BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
_FORMAT_BITS_M = 0  # L=1, M=0, Q=3, H=2
MAX_VERSION = 10


def _get_bit(x: int, i: int) -> bool:
    return (x >> i) & 1 != 0


def _num_raw_data_modules(ver: int) -> int:
    result = (16 * ver + 128) * ver + 64
    if ver >= 2:
        numalign = ver // 7 + 2
        result -= (25 * numalign - 10) * numalign - 55
        if ver >= 7:
            result -= 36
    return result


def _num_data_codewords(ver: int) -> int:
    return _num_raw_data_modules(ver) // 8 - _ECC_PER_BLOCK_M[ver] * _NUM_BLOCKS_M[ver]


# ---------- Reed-Solomon tren GF(2^8), da thuc 0x11D ----------
def _rs_multiply(x: int, y: int) -> int:
    z = 0
    for i in reversed(range(8)):
        z = (z << 1) ^ ((z >> 7) * 0x11D)
        z ^= ((y >> i) & 1) * x
    return z


def _rs_divisor(degree: int) -> list[int]:
    result = [0] * (degree - 1) + [1]
    root = 1
    for _ in range(degree):
        for j in range(degree):
            result[j] = _rs_multiply(result[j], root)
            if j + 1 < degree:
                result[j] ^= result[j + 1]
        root = _rs_multiply(root, 0x02)
    return result


def _rs_remainder(data: list[int], divisor: list[int]) -> list[int]:
    result = [0] * len(divisor)
    for b in data:
        factor = b ^ result.pop(0)
        result.append(0)
        for i, coef in enumerate(divisor):
            result[i] ^= _rs_multiply(coef, factor)
    return result


class _Symbol:
    def __init__(self, ver: int) -> None:
        self.ver = ver
        self.size = ver * 4 + 17
        self.modules = [[False] * self.size for _ in range(self.size)]
        self.is_func = [[False] * self.size for _ in range(self.size)]

    def set_func(self, x: int, y: int, dark: bool) -> None:
        self.modules[y][x] = dark
        self.is_func[y][x] = True

    # ---------- function patterns ----------
    def alignment_positions(self) -> list[int]:
        if self.ver == 1:
            return []
        numalign = self.ver // 7 + 2
        step = (self.ver * 8 + numalign * 3 + 5) // (numalign * 4 - 4) * 2
        result = [self.size - 7 - i * step for i in range(numalign - 1)] + [6]
        return list(reversed(result))

    def draw_function_patterns(self) -> None:
        for i in range(self.size):
            self.set_func(6, i, i % 2 == 0)
            self.set_func(i, 6, i % 2 == 0)
        for x, y in ((3, 3), (self.size - 4, 3), (3, self.size - 4)):
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < self.size and 0 <= yy < self.size:
                        self.set_func(xx, yy, max(abs(dx), abs(dy)) not in (2, 4))
        pos = self.alignment_positions()
        last = len(pos) - 1
        for i, ax in enumerate(pos):
            for j, ay in enumerate(pos):
                if (i, j) in ((0, 0), (0, last), (last, 0)):
                    continue  # trung finder pattern
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        self.set_func(ax + dx, ay + dy, max(abs(dx), abs(dy)) != 1)
        self.draw_format_bits(0)  # tam, ve lai sau khi chon mask
        self.draw_version()

    def draw_format_bits(self, mask: int) -> None:
        data = _FORMAT_BITS_M << 3 | mask
        rem = data
        for _ in range(10):
            rem = (rem << 1) ^ ((rem >> 9) * 0x537)
        bits = (data << 10 | rem) ^ 0x5412
        for i in range(0, 6):
            self.set_func(8, i, _get_bit(bits, i))
        self.set_func(8, 7, _get_bit(bits, 6))
        self.set_func(8, 8, _get_bit(bits, 7))
        self.set_func(7, 8, _get_bit(bits, 8))
        for i in range(9, 15):
            self.set_func(14 - i, 8, _get_bit(bits, i))
        for i in range(0, 8):
            self.set_func(self.size - 1 - i, 8, _get_bit(bits, i))
        for i in range(8, 15):
            self.set_func(8, self.size - 15 + i, _get_bit(bits, i))
        self.set_func(8, self.size - 8, True)  # dark module

    def draw_version(self) -> None:
        if self.ver < 7:
            return
        rem = self.ver
        for _ in range(12):
            rem = (rem << 1) ^ ((rem >> 11) * 0x1F25)
        bits = self.ver << 12 | rem
        for i in range(18):
            bit = _get_bit(bits, i)
            a, b = self.size - 11 + i % 3, i // 3
            self.set_func(a, b, bit)
            self.set_func(b, a, bit)

    # ---------- du lieu ----------
    def add_ecc_and_interleave(self, data: list[int]) -> list[int]:
        numblocks = _NUM_BLOCKS_M[self.ver]
        blockecclen = _ECC_PER_BLOCK_M[self.ver]
        rawcodewords = _num_raw_data_modules(self.ver) // 8
        numshortblocks = numblocks - rawcodewords % numblocks
        shortblocklen = rawcodewords // numblocks
        divisor = _rs_divisor(blockecclen)
        blocks, k = [], 0
        for i in range(numblocks):
            dat = data[k: k + shortblocklen - blockecclen + (0 if i < numshortblocks else 1)]
            k += len(dat)
            ecc = _rs_remainder(dat, divisor)
            if i < numshortblocks:
                dat.append(0)
            blocks.append(dat + ecc)
        result = []
        for i in range(len(blocks[0])):
            for j, blk in enumerate(blocks):
                if i != shortblocklen - blockecclen or j >= numshortblocks:
                    result.append(blk[i])
        return result

    def draw_codewords(self, data: list[int]) -> None:
        i = 0
        right = self.size - 1
        while right >= 1:
            if right == 6:
                right = 5
            for vert in range(self.size):
                for j in range(2):
                    x = right - j
                    upward = (right + 1) & 2 == 0
                    y = self.size - 1 - vert if upward else vert
                    if not self.is_func[y][x] and i < len(data) * 8:
                        self.modules[y][x] = _get_bit(data[i >> 3], 7 - (i & 7))
                        i += 1
            right -= 2

    def apply_mask(self, mask: int) -> None:
        f = _MASKS[mask]
        for y in range(self.size):
            for x in range(self.size):
                if not self.is_func[y][x] and f(x, y):
                    self.modules[y][x] = not self.modules[y][x]

    def penalty(self) -> int:
        """Diem phat theo 4 quy tac cua spec, de chon mask de quet nhat."""
        n, m = self.size, self.modules
        score = 0
        lines = [m[y] for y in range(n)] + [[m[y][x] for y in range(n)] for x in range(n)]
        for line in lines:  # quy tac 1: chuoi cung mau >= 5
            run, prev = 0, None
            for c in line:
                if c == prev:
                    run += 1
                else:
                    if run >= 5:
                        score += run - 2
                    run, prev = 1, c
            if run >= 5:
                score += run - 2
        for y in range(n - 1):  # quy tac 2: khoi 2x2
            for x in range(n - 1):
                if m[y][x] == m[y][x + 1] == m[y + 1][x] == m[y + 1][x + 1]:
                    score += 3
        pat1 = [True, False, True, True, True, False, True, False, False, False, False]
        pat2 = pat1[::-1]
        for line in lines:  # quy tac 3: giong finder pattern
            for i in range(n - 10):
                seg = line[i: i + 11]
                if seg == pat1 or seg == pat2:
                    score += 40
        dark = sum(sum(row) for row in m)  # quy tac 4: can bang den/trang
        total = n * n
        k = (abs(dark * 20 - total * 10) + total - 1) // total - 1
        score += max(k, 0) * 10
        return score


_MASKS = [
    lambda x, y: (x + y) % 2 == 0,
    lambda x, y: y % 2 == 0,
    lambda x, y: x % 3 == 0,
    lambda x, y: (x + y) % 3 == 0,
    lambda x, y: (x // 3 + y // 2) % 2 == 0,
    lambda x, y: x * y % 2 + x * y % 3 == 0,
    lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0,
    lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0,
]


def _encode_data(payload: bytes) -> tuple[int, list[int]]:
    for ver in range(1, MAX_VERSION + 1):
        count_bits = 8 if ver < 10 else 16
        capacity = _num_data_codewords(ver) * 8
        if 4 + count_bits + len(payload) * 8 <= capacity:
            break
    else:
        raise ValueError(f"Chuoi qua dai cho QR version {MAX_VERSION} ({len(payload)} byte)")
    bits: list[int] = []

    def put(val: int, n: int) -> None:
        bits.extend((val >> i) & 1 for i in reversed(range(n)))

    put(0b0100, 4)  # che do byte
    put(len(payload), count_bits)
    for b in payload:
        put(b, 8)
    put(0, min(4, capacity - len(bits)))  # terminator
    put(0, -len(bits) % 8)
    pad = 0xEC
    while len(bits) < capacity:
        put(pad, 8)
        pad ^= 0xEC ^ 0x11
    data = [int("".join(map(str, bits[i: i + 8])), 2) for i in range(0, len(bits), 8)]
    return ver, data


def make_qr(text: str) -> list[list[bool]]:
    ver, data = _encode_data(text.encode("utf-8"))
    sym = _Symbol(ver)
    sym.draw_function_patterns()
    sym.draw_codewords(sym.add_ecc_and_interleave(data))
    best, best_score = 0, None
    for mask in range(8):
        sym.apply_mask(mask)
        sym.draw_format_bits(mask)
        score = sym.penalty()
        if best_score is None or score < best_score:
            best, best_score = mask, score
        sym.apply_mask(mask)  # XOR lan nua = go mask
    sym.apply_mask(best)
    sym.draw_format_bits(best)
    return sym.modules
