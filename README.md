# Card Table

A wrestling card game for a room full of people watching a show together. One
player starts a table and gets a four-letter code; everyone else joins from
their own phone. There is no server, no database and no hosting bill — the site
is plain HTML and JavaScript on GitHub Pages, and the phones talk to each other
directly.

**602 cards**, from two packs merged into one deck:

| Kind | Count | Where it lives |
| --- | --- | --- |
| Mini Game | 430 | the draw pile — one a turn |
| Event Card | 48 | your hand |
| PPV Action | 80 | your hand |
| Private Player Card | 28 | your hand, one-shot powers |
| Money in the Bank | 16 | your hand, only if the host turns it on |

The first pack (124 cards) was transcribed by hand, text and all. The cards3.1
set (478) prints its rule on the art, so those cards carry a title, a number
and their outcome buttons, and the rule itself is read off the card — which is
why tapping a card to read it matters more than it used to.

There are two ways to play it:

- **Round one screen.** No phones, no room code. Type everyone's names into a
  laptop or a TV, and the screen deals, shows the card and runs the clock for
  whoever is up. Mini Games only — 430 of them — because there is nowhere
  private to hold a hand when everyone is looking at the same display.
- **A phone each.** One player starts a table and gets a four-letter code;
  everyone else joins from their own phone and holds a hand of cards they can
  play, counter and bluff with. This is the full game.

They are the same night, not two apps, and you can start with the first and
move to the second: anyone who wants a hand joins with the code **mid-game**
and is dealt in where they sit, keeping their turn and everything they have
already drunk. The seats still without a phone carry on with the Mini Games.

---

## How a night works

1. **Everyone picks a wrestler** in the lobby. A lot of Event Cards key off it
   ("if your chosen wrestler is cut open, down your drink").
2. **Each player is dealt a hand, held secret** (four cards by default), from
   the Event, PPV and Private Player packs. Playing one uses it
   up — it leaves your hand and is replaced from the pack, so a hand is always
   four cards and there is always something to play.
3. **Playing a card puts it face down.** You choose who it is aimed at
   (the card's printed target is pre-selected, so accepting it is one tap).
   Nobody sees which card it is — not even the person it's aimed at.
4. **They can try to name it.** The face-down card gives away **what kind** it
   is — Event, PPV, Private Player, Money in the Bank — and the box completes
   against that pack only. (With 172 cards you could be holding, a blind guess
   would be a lottery rather than a read; narrowed to one kind it is 80 at
   worst, and knowing someone has been sitting on a PPV card all night is
   exactly the sort of thing you *should* be able to use.)
   Guess right and the card turns back on whoever played it: *they* take
   the drink. Take it on the chin instead and you pay the base drink.
   **Botch the call and your drink doubles** — so the amount at stake is shown
   while the card is still face down, and you decide whether it's worth a go.
5. **The card turns over.** It takes the whole screen for a few seconds on
   every device — the art, who played it, who it hit, and who called it.
6. **On your turn you draw a Mini Game.** The table plays it out loud, then
   whoever drew it taps the outcome that actually happened and picks who lost.
7. **Once a turn you can bin a card**, on your own turn, and take a fresh one
   from the pack. It costs a three-second sip — cheap enough to be worth it for
   a card that's never going to come up, dear enough that you can't cycle your
   whole hand.
8. **The clock takes over**, then the turn ends itself. Every screen switches
   to one shared countdown; the player who dealt the drink out starts it when
   everyone is actually looking. When it runs out the turn passes on its own
   and the next player can draw.

The app deliberately does not try to referee. It cannot know who fluffed the
naming game, so it shows the card, offers the outcomes printed on it, and turns
whichever one a human taps into a drink with a shared countdown.

**Hands are secret**, which is a change from the first version — they were
face-up back when Event Cards were permanent standing rules the table had to
enforce. They're one-use plays now, and guessing a card would be no trick at
all if everyone could see who was holding what. What *is* public is the pack:
every Event Card's name and text, which is what the guess box completes
against. The secret is only ever who holds which.

### Round one screen

Press **Play on this screen**, type the names in the order people are sitting
— that order is the game, half the deck says "the person to your left" — and
start. The shared screen then shows whose go it is and offers that seat's
buttons with their name on them, so nobody is hunting for which phone is
supposed to tap what.

At TV shape it lays itself out sideways: the card at full height with its rule
set beside it in large type, the table along the bottom, and the countdown
filling the whole screen when somebody owes a drink. The whole game sits in one
screenful — nobody scrolls a television — and there's a browser test that fails
if it ever stops doing so.

A room code still appears if the broker answers, so phones can join later, but
**Start never waits on it**: a dead broker costs you the phones and nothing
else. The screen itself is not a player — it deals and displays, takes no turn,
and never shows up in the tally.

### Tonight's rules

The host sets these in the lobby and they lock when play starts. Everyone sees
the same panel, so the table can see what it has agreed to.

| Option | Choices | What it does |
| --- | --- | --- |
| **Drink lengths** | Mid carder · Main eventer · Champion | Rescales the common 2/3/5/10 second bands — down to 1/1/3/5, as printed, or up to 4/5/10/15 |
| **Measured in** | Seconds · Sips | Sips drop the countdown and ask for mouthfuls instead — for spirits |
| **Countering** | On · Off | Off means a played card resolves straight away, face up |
| **Hardcore match** | Off · 5% · 10% · 20% | Every drink has that chance of becoming a shot |
| **Money in the Bank** | Leave out · Shuffle in | 16 cards that only mean anything on a night with an MITB match |
| **Cards in hand** | 3 · 4 · 5 | Fewer makes each card matter; more makes countering easier |

Two things worth knowing about how these work:

- **Drink lengths only move the common bands.** Of the 590 timed outcomes in
  the merged deck, 315 are three seconds, 120 are five, 71 are two and 8 are
  ten — 87% of the game sits on those four numbers, so rescaling them is
  enough. (The two-second band is almost entirely the second pack, which is
  why it was added when the packs were merged.) A card that prints its own
  number keeps it: the 28-second WrestleMania forfeit, the 30-second Royal
  Rumble, "8 seconds in the name of an 8-hour shift". Rescaling those would
  break the joke.
- **Hardcore is sized off a real night.** Simulating forty 4-player nights
  gives about 74 drinks, roughly 19 each. So 5% is about four shots across the
  table — frequent enough to be a threat, rare enough to stay funny. 20% is
  about one in five and is there for the ambitious.

The schema in `js/rules/wrestling.js` is data, and the lobby renders itself
from it — a new option is one entry there plus wherever it's read. The engine
refuses any key it doesn't know and any value not on the list, so a client
can't invent an option or set a real one to something the rules have never
seen.

### When it gets stuck

A room full of people with drinks in their hands will put a phone down
mid-turn, and that used to leave the whole table with nothing to press: only
the player on the clock can draw or end their turn, a face-down card freezes
everyone, and a vote freezes everyone twice over.

So there is one action that clears whatever is actually in the way, and it says
which:

| What's blocking | What the button says | What it does |
| --- | --- | --- |
| A vote nobody finishes | **Call the vote** | Counts the votes already cast |
| A face-down card whose target has wandered off | **Turn the card over** | Lands it as played |
| A turn nobody moves | **Skip Jude** | Ends the turn and moves on |

Three things keep it honest. It **never cancels a drink** — you cannot tap your
way out of what you owe. It does **one thing per tap**, and the log names
whoever pressed it, which is the real check on it. And for anyone other than
the host and the person being waited on, it only appears after **45 seconds**:
ungated, it is just a button for skipping somebody's turn or denying them a
counter, which is exactly what the rest of the rules are careful not to allow.

"Next player" opens up the same way — the host can always use it, anyone can
once the turn-holder drops off, and it is there before you have drawn so a turn
you want to pass isn't a dead end. Drink timers too: if the dealer and the
drinker have both vanished, anyone can close the batch out.

### What it does handle

- **Drink timers.** One countdown for the whole room, corrected for clock drift
  between devices. A play that puts three people on the clock is one timer, not
  three. The person who dealt it out runs it; the drinkers and the host can too,
  so a dead phone never leaves the table waiting.
- **Left and right.** Cards that say "the person to your right" resolve from
  the seating order — nobody has to pick from a list. Seating is the order
  people joined, which the lobby shows, so agree which way round it goes before
  anyone is drunk.
- **Pick-a-player.** Cards that say "pick any player" open a list of names.
  Mini Game outcomes that name a seat ("the person to your right") are worked
  out from the seating and can't be redirected — that one isn't negotiable.
- **The doublers.** Botchamania doubles that player's drinks for five real
  minutes, automatically. Title Match Penalty doubles them whenever the host
  flags a title match (More → Title match on).
- **You Are Cursed.** The cursed player takes the next three punishments meant
  for anyone else.
- **Taboo Tuesday** runs an actual vote.
- **Countering.** The guess box matches loosely, so "no sell" finds NO SELL!.
  One correct call from any of the targets is enough — and it saves everyone,
  including anyone who already guessed wrong. A card aimed only at yourself
  skips the whole exchange, and whoever played it (or the host) can force it
  over if someone has put their phone down mid-guess.
- **The stake.** Everyone can see what's riding on a face-down card, because
  weighing it up is the decision. It gives away the size of the drink but not
  the card: three seconds is the most common drink in the pack by a distance,
  so on its own it narrows nothing down. A botched call doubles a timed drink; you can't down a
  can twice, so on a "down your drink" card the botch is recorded and costs
  nothing extra.
- **Getting unstuck.** A room full of people with drinks in their hands will
  put a phone down mid-turn, and that used to be able to freeze the table:
  only the player on the clock could draw or end their turn, a face-down card
  froze everyone until its targets answered, and a vote froze everyone until
  the last person voted. Now there is always a way out, labelled with what it
  will actually do — *Skip Bob*, *Turn the card over*, *Call the vote* —
  sitting in the dock when there is nothing else to press, and at the top of
  the More menu.

  **It never cancels a drink.** A face-down card lands exactly as it was
  played, a vote is counted on the votes already cast, and anything already
  owed stays owed. It clears one blocker per tap rather than running the
  night, and the log names whoever pressed it.

  **Who gets it, and when.** Whoever the table is waiting on gets it straight
  away — it is their turn, their card. So does the host, who can move the
  night on past anyone. Everyone else waits **45 seconds** first, or no time
  at all if the player in question has dropped off the table. That wait is
  the point of the design: without it the button is simply a way to skip
  somebody's turn, or to force a card over before its target has had a chance
  to counter, which is the one thing the rest of the rules are careful not to
  allow.
- **The tally.** Seconds drunk, drinks downed and shots taken per player, so
  "the worst performer of the game so far" has an answer. The engine always
  records seconds, even in sips mode, so the numbers stay comparable between
  nights however the table was measuring.

### What's in and what isn't

The first pack's Event Cards run 1–52 and **48 of them are here**: the sheet
carrying 5, 6, 7 and 8 was never supplied. Its Mini Games are a complete 1–76.

The cards3.1 set is all here, both halves of the split zip, plus two that
arrived outside it: **466 Later Train** (built from the photo) and **467 JD
Don't Google Me** (new — "all players must show their recent internet history,
or down your drink", with artwork drawn for it rather than lifted).

Two things to know about the merge:

- **Duplicates were kept on purpose.** Several cards appear in both packs,
  redrawn and renumbered, and a few titles repeat outright — "Heel Turn" is
  printed on four different cards. Ids are namespaced by pack
  (`event-24`, `mg-291`) so nothing collides, and the counter is judged on the
  **name**: naming "Heel Turn" counters any Heel Turn, because a player saying
  it out loud can't mean one rather than another.
- **Card 291 was already called "JD Don't Google Me"**, with a different rule
  (a three-second drink). It's still in. The new one is 467.

---

### Reading the cards

Tap any card — in your hand, on the table, anyone's — and it fills the screen.
The art is only ~380px wide at source with the rules printed small on it, so at
hand size it's something you recognise rather than something you read. The full
screen view gives the art the whole display and sets the same words as real
text underneath at a size that works across a dim room, with whatever you can
do with the card docked at the bottom. For the second pack there are no words
to set underneath — the rule is on the art — so for those cards the full screen
view *is* how you read them.

**The two packs are drawn to different shapes.** Pack 1 is a long 380×1020;
the PPV, Private Player and Money in the Bank cards are much squatter, around
400×728, and a couple are shapes of their own again. Every card carries the
size of its own art and sizes its own frame from it — one fixed ratio cropped
the bottom off the squat ones, which on those cards is most of the rule.

### Built for a phone

The layout is mobile-first in the literal sense: the phone rules are the
stylesheet's base case and `@media (min-width: 720px)` only relaxes them. Two
rules drive it — anything you have to tap lives in the bottom third of the
screen, and nothing important needs a scroll to notice.

In practice that means a dock pinned to the bottom holding the outcome buttons
and your hand, with the table scrolling above it. Your cards show cropped to
their number and title so four fit across a phone; tap one to see it full size.
There's a test that fails if a button ever ends up behind the hand, because it
did once on a 667px-tall screen.

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
  host migration. Whoever is least likely to wander off should host. (Any
  *other* phone going quiet is survivable — see *Getting unstuck*.)
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
index.html                markup for the four screens
css/style.css             styling — one dark theme, to match the card art
js/app.js                 wiring: routing, screens, prompts
js/ui.js                  rendering — pure functions of the view
js/room.js                the protocol: HostRoom, ClientRoom, identity
js/net.js                 transports: PeerJS, plus a loopback one for tests
js/engine.js              the generic engine — decks, hands, turns, seats, redaction
js/cards.js               card helpers (used by the engine's test fixture)
js/rules/wrestling.js     this game's rules
js/rules/index.js         the ruleset registry
cards/deck.json           all 602 cards: kind, pile, art size, outcomes
cards/*.webp              the card art, one file per card
tools/split-sheets.py     cuts the original 4-up sheets into single cards
tools/cards3.py           the cards3.1 catalogue: 476 titles, times and targets
tools/verify-cards.py     checks every image shows the card its name claims
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

The card art lives in `cards/`, named by pack and kind: `event-NN` and
`mini-NN` for the first pack, `mg-NNN` (Mini Game), `ppv-NNN`, `ppc-NNN`
(Private Player Card) and `mitb-NNN` for the second. The text and the outcome
buttons live in `tools/build-deck.py`, which generates `cards/deck.json`:

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

The originals came as sheets of four at 1536×1024, splitting on exact 384px
boundaries:

```bash
python3 tools/split-sheets.py ~/path/to/sheets   # cut them up
python3 tools/verify-cards.py                    # check the art matches the names
python3 tools/build-deck.py                      # regenerate deck.json
```

The one piece of hand-entered data is the `SHEETS` table in `split-sheets.py` —
which deck each sheet belongs to and what number it starts at. Get an entry
wrong and you get cards with the wrong art, which nothing else notices: the
data is right, the files are right, the pictures inside them are wrong.

That happened: two sheets were transposed, and four Event Cards spent a version
wearing Mini Game art. `verify-cards.py` exists because of it, and it reads the
two packs differently:

- **Pack 1** by colour — Mini Games have a red banner, Event Cards a gold one.
- **Pack 2** by shape. Every kind is gold there, but the banner spells out what
  it is (MINI GAME, PPV ACTION, PRIVATE PLAYER CARD, MONEY IN THE BANK). OCR
  makes a mess of stylised text on a textured banner, so instead each kind's
  banner is averaged into a single small picture and every card is matched
  against the four of them. All 478 land on their own kind, and a card cut from
  the wrong sheet would not.

Run it after any change to the sheets.

---

## Tests

```bash
npm test              # 140 unit, protocol and deck tests
npm run test:browser  # 100 checks in a real browser (needs playwright)
npm run verify:cards  # every image shows the card its filename claims
```

`tests/harness.html` plays a three-player night in a single tab over the
loopback transport and renders it through the real UI — it pulls its markup out
of `index.html` at load time, so it can't drift from the app. Open
`/tests/harness.html` in a browser to see the table without needing three
phones; `?turns=N` plays that many.

The fuzz test in `tests/wrestling.test.mjs` plays 100 random nights — guessing
at every third card — and checks the invariants that matter: a hand only ever
holds cards from the hand piles, no card is duplicated, and settled drinks
don't pile up.

Two browser checks exist because of one embarrassing failure: "Start a table"
once did nothing at all, because `js/app.js` imported something
`js/rules/index.js` didn't export yet, so the module never loaded and *no*
button on the page was wired up. Nothing caught it because nothing had ever
clicked the button. Now the suite stubs PeerJS, clicks all the way through to a
room code, and separately imports every module to check the graph resolves.

Two more are there specifically to stop hidden information leaking: one
scans a serialised view for any card in somebody else's hand, and the browser
test checks the face-down card's image never appears anywhere in the page while
it is still face down.

---

## What isn't built

- **Chat.** The protocol carries it and messages surface as toasts, but there's
  no input box yet.
- **Spectators** and **host migration.**
- **Card 50's house rule** is recorded and shown to everyone, but the app can't
  enforce it — that one's on you.
- **Event Cards 5-8.** Still missing; send the sheet and they drop in.
- **The second pack's special cards aren't special yet.** The first pack has a
  handful the app actually understands — Botchamania's five minutes, You Are
  Cursed, the title-match doubler. The cards3.1 set almost certainly has its
  own equivalents, but since its rules are printed on the art rather than in
  the data, the app can't see them: those cards hand out their drink and the
  rest is down to the table. Tell me which ones should do something and they
  can be wired up by id.
