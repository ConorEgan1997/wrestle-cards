#!/usr/bin/env python3
"""
Cut the original card sheets into one image per card.

The cards arrived as sheets of four at 1536x1024. The gaps between them sit on
exact 384px boundaries, so the split is arithmetic rather than clever.

The SHEETS table below is the one piece of hand-entered data here: which deck
each sheet belongs to and which card number it starts at. Getting an entry
wrong silently produces cards with the wrong art — a Mini Game sitting in
somebody's Event Card hand — so run tools/verify-cards.py afterwards. It reads
the banner colour off every generated file and fails if the art doesn't match
the name. (That check exists because two sheets were transposed here once.)

    python3 tools/split-sheets.py ~/path/to/original/sheets
    python3 tools/verify-cards.py
    python3 tools/build-deck.py
"""

import os
import sys
from PIL import Image

SHEET_W, SHEET_H = 1536, 1024
CARDS_PER_SHEET = 4
INSET = 2  # trims the white seam between neighbouring cards

# sheet filename stem -> (deck, number of its first card)
SHEETS = {
    # --- Event Cards (gold). 5-8 were never supplied. ---
    'received_1862273268512434': ('event', 1),
    'received_948778438284101':  ('event', 9),
    'received_1556843578860029': ('event', 13),
    'received_1515319483969790': ('event', 17),
    'received_1584032490134361': ('event', 21),
    'received_1056813470526848': ('event', 25),
    'received_4435364296778967': ('event', 29),
    'received_1120095850343391': ('event', 33),
    'received_3012875569056344': ('event', 37),
    'received_1405383261549260': ('event', 41),
    'received_2152291662360740': ('event', 45),
    'received_1591970565653477': ('event', 49),

    # --- Mini Games (red). A complete run, 1-76. ---
    'received_2142968326636315': ('mini', 1),
    'received_1747496499700720': ('mini', 5),
    'received_1390849739182138': ('mini', 9),
    'received_1124749533551480': ('mini', 13),
    'received_2235779343662001': ('mini', 17),
    'received_1584355693234973': ('mini', 21),
    'received_2237050400427718': ('mini', 25),
    'received_2233741987468563': ('mini', 29),
    'received_1458271839452914': ('mini', 33),
    'received_1381512830809668': ('mini', 37),
    'received_1543535087461865': ('mini', 41),
    'received_1085756823936105': ('mini', 45),
    'received_2559982464515500': ('mini', 49),
    'received_939549881984242':  ('mini', 53),
    'received_1835445507651120': ('mini', 57),
    'received_2141948003390303': ('mini', 61),
    'received_1107871252203729': ('mini', 65),
    'received_2119718905635315': ('mini', 69),
    'received_2304420703651484': ('mini', 73),
}

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'cards')


def main(src):
    os.makedirs(OUT, exist_ok=True)
    written = 0

    for stem, (deck, start) in SHEETS.items():
        path = os.path.join(src, f'{stem}.jpeg')
        if not os.path.exists(path):
            raise SystemExit(f'missing sheet: {path}')

        sheet = Image.open(path).convert('RGB')
        if sheet.size != (SHEET_W, SHEET_H):
            raise SystemExit(f'{stem}: expected {SHEET_W}x{SHEET_H}, got {sheet.size}')

        step = SHEET_W // CARDS_PER_SHEET
        for i in range(CARDS_PER_SHEET):
            box = (i * step + INSET, INSET, (i + 1) * step - INSET, SHEET_H - INSET)
            name = f'{deck}-{start + i:02d}.webp'
            sheet.crop(box).save(os.path.join(OUT, name), quality=78, method=6)
            written += 1

    print(f'{written} cards written to cards/')
    print('now run: python3 tools/verify-cards.py')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__.strip().splitlines()[-3].strip())
    main(os.path.expanduser(sys.argv[1]))
