#!/usr/bin/env python3
"""
Check every card image actually shows the card its filename claims.

Two sheets were transposed once when they were cut up, which put Mini Game art
on four Event Cards and vice versa. Nothing in the app noticed — the data was
right, the files were right, the pictures inside them were wrong — and it only
surfaced when somebody looked at a screenshot and thought "that card is red".

So the banner across the top of each card is read back, and the two packs need
two different readings:

  pack 1  Mini Games have a red banner, Event Cards a gold one. A colour is
          enough to tell them apart.

  pack 3  every kind is gold, but the banner spells out what it is — MINI
          GAME, PPV ACTION, PRIVATE PLAYER CARD, MONEY IN THE BANK. OCR makes
          a mess of stylised text on a textured banner, so instead each kind's
          banner is averaged into one picture and every card is matched
          against the four of them. A card whose banner looks more like
          another kind's is a card that was cut from the wrong sheet.

    python3 -W ignore tools/verify-cards.py
"""

import glob
import os
import statistics
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CARDS = os.path.join(HERE, '..', 'cards')

# What each prefix should be, and how many of them there are.
PACK1 = {'event': 48, 'mini': 76}          # 1-52 less the four never supplied
PACK3 = {'mg': 354, 'ppv': 80, 'ppc': 28, 'mitb': 16}

BANNER_WORDS = {
    'mg': 'MINI GAME', 'ppv': 'PPV ACTION',
    'ppc': 'PRIVATE PLAYER CARD', 'mitb': 'MONEY IN THE BANK',
}

# The averaged banner is compared at this size: small enough that the paper
# texture and the fire behind it wash out, big enough that four different
# words are still four different shapes.
GRID = (64, 16)


def banner_colour(path):
    """Pack 1: classify by the colour of the top banner. Red = mini, gold = event."""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    crop = im.crop((int(w * 0.25), int(h * 0.015), int(w * 0.95), int(h * 0.055)))

    pixels = list(crop.getdata())
    # The banner is the most saturated thing up there; ignore the rest.
    pixels.sort(key=lambda p: -(max(p) - min(p)))
    pixels = pixels[: max(1, len(pixels) // 3)]

    r = sum(p[0] for p in pixels) / len(pixels)
    g = sum(p[1] for p in pixels) / len(pixels)
    b = sum(p[2] for p in pixels) / len(pixels)
    return ('mini' if g < r * 0.55 else 'event'), (round(r), round(g), round(b))


def banner_shape(path):
    """Pack 3: the words on the banner, as a small normalised grey picture."""
    im = Image.open(path).convert('L')
    w, h = im.size
    # To the right of the number badge, down to just under the banner.
    crop = im.crop((int(w * 0.28), int(h * 0.012), int(w * 0.98), int(h * 0.072)))
    cells = list(crop.resize(GRID, Image.LANCZOS).getdata())
    # Stretch each card's own contrast so a darker print is not a difference.
    low, high = min(cells), max(cells)
    span = max(1, high - low)
    return [(c - low) / span for c in cells]


def distance(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b))


def check_pack1(problems, counts):
    for prefix in PACK1:
        for path in sorted(glob.glob(os.path.join(CARDS, f'{prefix}-*.webp'))):
            name = os.path.basename(path).removesuffix('.webp')
            counts[prefix] = counts.get(prefix, 0) + 1
            kind, rgb = banner_colour(path)
            if kind != prefix:
                problems.append(f'  {name}: the art is a {kind} card  rgb={rgb}')


def check_pack3(problems, counts):
    shapes = {}
    for prefix in PACK3:
        for path in sorted(glob.glob(os.path.join(CARDS, f'{prefix}-*.webp'))):
            name = os.path.basename(path).removesuffix('.webp')
            counts[prefix] = counts.get(prefix, 0) + 1
            shapes[name] = (prefix, banner_shape(path))

    if not shapes:
        return

    # One averaged banner per kind. The median, not the mean, so a handful of
    # odd cards can't drag the template towards themselves.
    template = {}
    for prefix in PACK3:
        members = [s for kind, s in shapes.values() if kind == prefix]
        if members:
            template[prefix] = [statistics.median(col) for col in zip(*members)]

    for name, (prefix, shape) in sorted(shapes.items()):
        ranked = sorted((distance(shape, t), kind) for kind, t in template.items())
        best, nearest = ranked[0]
        if nearest != prefix:
            problems.append(
                f'  {name}: the banner reads "{BANNER_WORDS[nearest]}", '
                f'not "{BANNER_WORDS[prefix]}"'
            )


def main():
    files = sorted(glob.glob(os.path.join(CARDS, '*.webp')))
    if not files:
        raise SystemExit('no card images found — run tools/split-sheets.py first')

    problems = []
    counts = {}

    check_pack1(problems, counts)
    check_pack3(problems, counts)

    for prefix, wanted in {**PACK1, **PACK3}.items():
        found = counts.get(prefix, 0)
        if found != wanted:
            problems.append(f'  expected {wanted} "{prefix}" cards, found {found}')

    seen = sum(counts.values())
    if seen != len(files):
        problems.append(f'  {len(files) - seen} images do not belong to any known pack')

    if problems:
        print(f'{len(files)} images checked — PROBLEMS:')
        print('\n'.join(problems))
        print('\nThe deck/number mapping in the splitter is probably wrong.')
        sys.exit(1)

    print(f'{len(files)} images checked — every card\'s art matches its name')
    for prefix, wanted in {**PACK1, **PACK3}.items():
        print(f'  {prefix:<6} {wanted:>4}')


if __name__ == '__main__':
    main()
