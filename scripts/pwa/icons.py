"""Installed-app icons from the official SUN MEDIA app icon (app/apple-icon.png, the same picture as the phone app's icon).
Nothing is redrawn: the picture is scaled; the maskable version gets the icon's own background around it so Android's
circle / squircle masks never cut the logo; the notification badge is the logo's own dark shape in white.
Run: python3 scripts/pwa/icons.py
"""
from PIL import Image, ImageDraw, ImageFilter

SRC = 'app/apple-icon.png'
OUT = 'public/pwa'
icon = Image.open(SRC).convert('RGB')
W = icon.width

for size in (192, 512):
    icon.resize((size, size), Image.LANCZOS).save(f'{OUT}/icon-{size}.png', optimize=True)

# Maskable: the whole icon at 80 %, on its own background (the vertical light-grey gradient continued to the edges).
# The logo then lies inside the central circle of radius 40 % that every mask keeps.
inner = round(W * 0.8)
off = (W - inner) // 2
scaled = icon.resize((inner, inner), Image.LANCZOS)
# Each row continues the colour the icon itself has at its edge there, so there is no seam to see.
canvas = Image.new('RGB', (W, W))
draw = ImageDraw.Draw(canvas)
for y in range(W):
    sy = min(inner - 1, max(0, y - off))
    left = scaled.getpixel((1, sy))
    right = scaled.getpixel((inner - 2, sy))
    for x in range(W):
        t = min(1, max(0, (x - off) / inner))
        canvas.putpixel((x, y), tuple(round(a + (b - a) * t) for a, b in zip(left, right)))
feather = Image.new('L', (inner, inner), 0)
ImageDraw.Draw(feather).rectangle([inner * 0.06, inner * 0.06, inner * 0.94, inner * 0.94], fill=255)
feather = feather.filter(ImageFilter.GaussianBlur(inner * 0.03))
canvas.paste(scaled, (off, off), feather)
for size in (192, 512):
    canvas.resize((size, size), Image.LANCZOS).save(f'{OUT}/maskable-{size}.png', optimize=True)

# Badge (Android status bar, monochrome): the logo's dark parts as white on transparent.
gray = icon.convert('L')
alpha = gray.point(lambda v: 255 if v < 90 else (0 if v > 150 else round((150 - v) * 255 / 60)))
# The lime "I" of MEDIA belongs to the logo too.
r, g, b = icon.split()
lime = Image.merge('RGB', (r, g, b)).point(lambda v: v).convert('HSV').split()[1].point(lambda v: 255 if v > 120 else 0)
alpha = Image.composite(Image.new('L', alpha.size, 255), alpha, lime)
box = alpha.getbbox()
logo = alpha.crop(box)
side = max(logo.size)
square = Image.new('L', (side, side), 0)
square.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2))
mark = square.resize((84, 84), Image.LANCZOS)
badge = Image.new('RGBA', (96, 96), (255, 255, 255, 0))
white = Image.new('RGBA', (84, 84), (255, 255, 255, 255))
badge.paste(white, (6, 6), mark)
badge.save(f'{OUT}/badge-96.png', optimize=True)
print('ok')
