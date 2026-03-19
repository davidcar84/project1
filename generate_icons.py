"""Generate PWA icon PNGs using only Python stdlib (no Pillow needed)."""
import struct
import zlib
import math
import os

def create_png(filename, size):
    """Create a blue square PNG with a white PDF document icon drawn inside."""
    w = h = size
    pixels = []

    # Colors
    BG   = (37, 99, 235)   # #2563eb  — blue background
    PAGE = (255, 255, 255) # white page
    FOLD = (191, 219, 254) # #bfdbfe  — light blue fold
    TEXT = (37, 99, 235)   # blue text on white

    # Page rect: 30%→70% horizontally, 18%→82% vertically
    px1 = int(w * 0.28); px2 = int(w * 0.72)
    py1 = int(h * 0.14); py2 = int(h * 0.86)
    # Corner fold
    fold_x = int(w * 0.55); fold_y = int(h * 0.38)

    for y in range(h):
        row = bytearray([0])  # filter byte
        for x in range(w):
            # Rounded background with corner check
            r_corner = size * 0.22
            in_corner = False
            for cx, cy in [(r_corner, r_corner),
                           (w-r_corner, r_corner),
                           (r_corner, h-r_corner),
                           (w-r_corner, h-r_corner)]:
                dist = math.sqrt((x-cx)**2 + (y-cy)**2)
                if dist < r_corner and not (
                    (px1 <= x <= px2) or (py1 <= y <= py2)):
                    # outside the page area and in a corner zone
                    pass
            # Determine pixel
            in_bg_rect = True
            # Check if in the rounded background
            rx, ry = r_corner, r_corner
            def in_round_rect(px, py, w, h, r):
                if px < r and py < r:    return (px-r)**2+(py-r)**2 <= r**2
                if px > w-r and py < r:  return (px-(w-r))**2+(py-r)**2 <= r**2
                if px < r and py > h-r:  return (px-r)**2+(py-(h-r))**2 <= r**2
                if px > w-r and py > h-r:return (px-(w-r))**2+(py-(h-r))**2 <= r**2
                return True
            if not in_round_rect(x, y, w, h, r_corner):
                row += bytes([0, 0, 0, 0])  # transparent
                continue

            # Page body (white)
            in_page = (px1 <= x <= px2 and py1 <= y <= py2)
            # Fold triangle: top-right area of page
            in_fold = (x >= fold_x and y <= fold_y and
                       (x - fold_x) + (fold_y - y) <= (fold_y - py1 + px2 - fold_x))

            if in_page and not in_fold:
                # Page drop shadow (simple dark strip bottom/right of page)
                if x == px2 or y == py2:
                    row += bytes([180, 180, 200, 255])
                else:
                    row += bytes([*PAGE, 255])
            elif in_fold:
                row += bytes([*FOLD, 255])
            else:
                row += bytes([*BG, 255])

        pixels.append(bytes(row))

    raw   = b''.join(pixels)
    comp  = zlib.compress(raw, 9)

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)

    sig  = b'\x89PNG\r\n\x1a\n'
    # IHDR: width, height, bit depth, color type 6 (RGBA), compression, filter, interlace
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', comp)
    iend = chunk(b'IEND', b'')

    os.makedirs(os.path.dirname(filename) or '.', exist_ok=True)
    with open(filename, 'wb') as f:
        f.write(sig + ihdr + idat + iend)
    print(f'Created {filename}  ({os.path.getsize(filename):,} bytes)')


if __name__ == '__main__':
    base = os.path.join(os.path.dirname(__file__), 'icons')
    create_png(os.path.join(base, 'icon-192.png'), 192)
    create_png(os.path.join(base, 'icon-512.png'), 512)
    print('Icons generated successfully.')
