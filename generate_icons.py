"""Generate Workout Tracker PWA icons (green square + white dumbbell) with stdlib only."""
import struct
import zlib
import os

BG = (16, 185, 129)   # #10b981 emerald
FG = (255, 255, 255)  # white dumbbell


def in_round_rect(x, y, w, h, r):
    if x < r and y < r:         return (x - r) ** 2 + (y - r) ** 2 <= r * r
    if x > w - r and y < r:     return (x - (w - r)) ** 2 + (y - r) ** 2 <= r * r
    if x < r and y > h - r:     return (x - r) ** 2 + (y - (h - r)) ** 2 <= r * r
    if x > w - r and y > h - r: return (x - (w - r)) ** 2 + (y - (h - r)) ** 2 <= r * r
    return True


def dumbbell(x, y, w, h):
    cx, cy = w / 2, h / 2
    handle_half_len = w * 0.22
    handle_half_thick = h * 0.05
    plate_outer_half = w * 0.30
    plate_inner_half = w * 0.24
    plate_half_thick = h * 0.18
    cap_half_thick = h * 0.24
    cap_outer_half = w * 0.33
    dx = abs(x - cx); dy = abs(y - cy)
    if dx <= handle_half_len and dy <= handle_half_thick: return True
    if plate_inner_half <= dx <= plate_outer_half and dy <= plate_half_thick: return True
    if plate_outer_half <= dx <= cap_outer_half and dy <= cap_half_thick: return True
    return False


def create_png(path, size):
    w = h = size
    r = size * 0.22
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            if not in_round_rect(x, y, w, h, r):
                raw += bytes([0, 0, 0, 0]); continue
            if dumbbell(x, y, w, h):
                raw += bytes([*FG, 255])
            else:
                raw += bytes([*BG, 255])

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"Wrote {path} ({len(png)} bytes)")


if __name__ == "__main__":
    os.makedirs("icons", exist_ok=True)
    create_png("icons/icon-192.png", 192)
    create_png("icons/icon-512.png", 512)
