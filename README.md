# Card Table

A wrestling card game for a room full of people watching a show together. One
player starts a table and gets a four-letter code; everyone else joins from
their own phone. There is no server, no database and no hosting bill — the site
is plain HTML and JavaScript on GitHub Pages, and the phones talk to each other
directly.

124 cards: 76 Mini Games and 48 Event Cards.

---

## How a night works

1. **Everyone picks a wrestler** in the lobby. A lot of Event Cards key off it
   ("if your chosen wrestler is cut open, down your drink").
2. **Each player is dealt four Event Cards.** These are face-up for the whole
   table — they are standing rules everyone has to be able to enforce, so
   hiding them would only cause arguments. Reactive ones like No Sell, Rope
   Break and You Are Cursed are used once and replaced; the rest stand all
   night.
3. **On your turn you draw a Mini Game.** The table plays it out loud, then
   whoever is resolving it taps the outcome that actually happened.

The app deliberately does not try to referee. It cannot know who fluffed the
naming game, so it shows the card, offers the outcomes printed on it, and turns
whichever one a human taps into a drink with a shared countdown.

### What it does handle

- **Drink timers.** Tap to start; everyone's screen shows the same countdown,
  corrected for clock drift between devices.
- **Left and right.** Cards that say "the person to your right" resolve from
  the seating order — nobody has to pick from a list. Seating is the order
  people joined, which the lobby shows, so agree which way round it goes before
  anyone is drunk.
- **Pick-a-player.** Cards that say "pick any player" open a list of names.
- **The doublers.** Botchamania doubles that player's drinks for five real
  minutes, automatically. Title Match Penalty doubles them whenever the host
  flags a title match (More → Title match on).
- **You Are Cursed.** The cursed player takes the next three punishments meant
  for anyone else.
- **Taboo Tuesday** runs an actual vote.
- **The tally.** Seconds drunk and drinks downed per player, so "the worst
  performer of the game so far" has an answer.

### The missing cards

Event Cards 5, 6, 7 and 8 are not in here — that sheet wasn't in the zip. Send
it over and they drop in with one command (see *Adding or fixing cards*).

---

## Running it locally

```bash
npm start           # http://localhost:8080
```

Open it in two browser tabs. Host in one, copy the code, join from the other.
Two tabs count as two different players (the identity token is deliberately
per-tab), so you can test the whole thing on your own.

Node is only used for the dev server and the tests. Nothing is needed to deploy.

## Putting it on GitHub Pages

```bash
git init
git add .
git commit -m "Card Table"
git branch -M main
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

Then **Settings → Pages → Source: Deploy from a branch → main / (root)**. A
minute later it is live at `https://<you>.github.io/<repo>/`.

Two things worth knowing:

- **HTTPS is required** for the peer-to-peer connection, which GitHub Pages
  gives you. Opening the files off disk with `file://` will not work.
- The `.nojekyll` file is deliberate — without it GitHub's Jekyll step can eat
  directories, and there is no build step here to paper over that.

One practical note: free GitHub Pages serves from a **public** repo, so the card
art goes up publicly along with the code. The images are full of WWE
photographs and logos. For a private game among friends that is unlikely to
bother anyone, but if you would rather it not be world-readable, Pages from a
private repo needs a paid GitHub plan — or you can keep the repo private and
just run `npm start` on a laptop on the same wifi.

---

## How the multiplayer works

One player's browser is the **host**: it runs the rules engine and is the only
place the full state lives. Everyone else sends actions to it and gets back a
view. The host checks every action when it arrives, so a player poking at the
console can't draw out of turn or hand themselves a clean sheet.

The room code *is* the host's WebRTC peer id (`ccg-v1-ABCD`), which is the trick
that removes the need for a backend: clients don't look a room up anywhere, they
dial it directly. The public PeerJS broker introduces the two phones and then
drops out; the cards go peer to peer.

### The trade-offs

- **If the host closes their tab, the night ends** for everyone. There is no
  host migration. Whoever is least likely to wander off should host.
- A refresh is fine — your seat, hand and tally come back, because the identity
  token survives a reload.
- Codes are four characters so two tables *could* collide; the host silently
  retries with a new one.
- Some restrictive networks (a few corporate and mobile-carrier NATs) block
  direct peer connections. Fixing that properly needs a TURN relay, which is the
  one piece that generally costs money.

If peer-to-peer ever becomes a nuisance, the fix is contained: `js/net.js` is the
only file that knows about WebRTC.

---

## The files

```
index.html                markup for the three screens
css/style.css             styling — one dark theme, to match the card art
js/app.js                 wiring: routing, screens, prompts
js/ui.js                  rendering — pure functions of the view
js/room.js                the protocol: HostRoom, ClientRoom, identity
js/net.js                 transports: PeerJS, plus a loopback one for tests
js/engine.js              the generic engine — decks, hands, turns, redaction
js/cards.js               card helpers (used by the engine's test fixture)
js/rules/wrestling.js     this game's rules
js/rules/index.js         the ruleset registry
cards/deck.json           all 124 cards: text and outcomes
cards/*.webp              the card art, one file per card
tools/build-deck.py       rebuilds deck.json from the transcribed card text
tools/dev-server.mjs      zero-dependency static server
tests/                    unit, protocol, deck and browser tests
```

The engine knows about decks, hands, turn order and hidden information, and
nothing about wrestling. A second game would be a new file in `js/rules/` and
nothing else — `tests/fixtures/crazy-eights.js` is exactly that, kept as the
engine's regression fixture.

---

## Adding or fixing cards

The card art lives in `cards/` as `event-NN.webp` and `mini-NN.webp`. The text
and the outcome buttons live in `tools/build-deck.py`, which generates
`cards/deck.json`:

```bash
python3 tools/build-deck.py
```

It fails loudly if a card has no image, so the data and the art can't drift
apart.

To add a card, drop the image in `cards/` at the right name and add an entry:

```python
(77, "Card Title",
 "The text printed on the card.",
 [sec("Loser drinks 5s", 5, "choose")]),
```

The outcome helpers are `sec(label, seconds, target)`, `down(label, target)`,
`watch(label, target)` for a count-up timer, and `note(label, target)` for
something with no drink attached. Targets:

| target | who it lands on |
| --- | --- |
| `self` | whoever drew or played the card |
| `left` / `right` | their neighbour, from the seating |
| `selfright` | both of them |
| `all` / `others` | everyone / everyone else |
| `choose` | one player, picked from a list |
| `many` | any number of players |
| `vote` | the table votes |

Give a card more than one outcome when it has a succeed/fail split — each one
becomes a button.

### Splitting new sheets

The originals came as sheets of four cards at 1536×1024. `tools/build-deck.py`
documents the format; the sheets split on exact 384px boundaries. If you send
more, say which deck and which numbers each sheet covers and they go in the
same way.

---

## Tests

```bash
npm test              # 64 unit, protocol and deck tests
npm run test:browser  # 32 checks in a real browser (needs playwright)
```

`tests/harness.html` plays a three-player night in a single tab over the
loopback transport and renders it through the real UI — it pulls its markup out
of `index.html` at load time, so it can't drift from the app. Open
`/tests/harness.html` in a browser to see the table without needing three
phones; `?turns=N` plays that many.

The fuzz test in `tests/wrestling.test.mjs` plays 100 random nights and checks
the invariants that matter: a hand only ever holds Event Cards, no card is
duplicated, and settled drinks don't pile up.

---

## What isn't built

- **Chat.** The protocol carries it and messages surface as toasts, but there's
  no input box yet.
- **Spectators** and **host migration.**
- **Card 50's house rule** is recorded and shown to everyone, but the app can't
  enforce it — that one's on you.
