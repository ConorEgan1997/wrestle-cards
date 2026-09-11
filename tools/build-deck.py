#!/usr/bin/env python3
"""
Builds cards/deck.json from the transcribed card text.

Every card carries its printed text plus one or more *outcomes*. An outcome is
the button the app shows when the card is resolved: a label, how long the
penalty is, and who it lands on. That is how 124 different cards are supported
without writing 124 different rules — the app never has to judge who lost a
naming game, it just offers the buttons and a player taps the right one.

target codes
  choose      the resolver picks one player        (the common case)
  many        the resolver picks any number
  self        the player who drew / holds the card
  left/right  that player's neighbour, worked out from the seating
  all         everybody
  vote        everyone votes, most votes drinks

penalty kinds
  seconds: N      a countdown of N seconds
  down: true      down your drink (no timer, counted separately)
  stopwatch: true a count-up timer the drinker stops
"""

import json, os

def sec(label, n, target="choose"):
    return {"label": label, "seconds": n, "target": target}

def down(label, target="self"):
    return {"label": label, "down": True, "target": target}

def watch(label, target="self"):
    return {"label": label, "stopwatch": True, "target": target}

def note(label, target="self"):
    """An outcome with no drink — a declaration, a rule being created."""
    return {"label": label, "target": target, "seconds": 0}


# --------------------------------------------------------------------------
# EVENT CARDS — held in hand. Mostly standing triggers ("drink when X happens
# on screen"); the one-shots are marked `once`.
# --------------------------------------------------------------------------

EVENT = [
 (1, "In the Hold",
  "Drink for the duration of time your chosen wrestler is placed in a finisher or signature submission.",
  [watch("They're in the hold — start the clock")], False),
 (2, "Money in the Bank",
  "Cash in your drinks and pass them onto someone else.",
  [note("Cash in — pass my drinks on", "choose")], True),
 (3, "German Suplex",
  "If a German suplex occurs on your chosen wrestler drink for 3 seconds.",
  [sec("German suplex — I drink 3s", 3, "self")], False),
 (4, "Title Loss",
  "If your chosen wrestler loses his title down your drink.",
  [down("They lost the title — I down it")], False),

 (9, "Heel Turn",
  "Drink for 5 seconds if a heel turn occurs.",
  [sec("Heel turn — I drink 5s", 5, "self")], False),
 (10, "Shenanigans",
  "Drink for 3 seconds if any shenanigans occurs.",
  [sec("Shenanigans — I drink 3s", 3, "self")], False),
 (11, "Face Turn",
  "Drink for 5 seconds if a face turn occurs.",
  [sec("Face turn — I drink 5s", 5, "self")], False),
 (12, "Product Placement",
  "Take a drink for every shameless product placement ad.",
  [sec("Product placement — I drink 3s", 3, "self")], False),

 (13, "Hit With a Finisher",
  "If your chosen wrestler gets hit with a finisher drink for 5 seconds.",
  [sec("Hit with a finisher — I drink 5s", 5, "self")], False),
 (14, "Celebrity Spotted",
  "Drink every time a celebrity is shown in the crowd.",
  [sec("Celebrity spotted — I drink 3s", 3, "self")], False),
 (15, "Bladed",
  "Down your drink if your chosen wrestler is cut open.",
  [down("They're bleeding — I down it")], False),
 (16, "The Bloodline",
  "Take a drink anytime The Bloodline is mentioned.",
  [sec("Bloodline mentioned — I drink 3s", 3, "self")], False),

 (17, "Divas on Screen",
  "Drink anytime an attractive diva appears.",
  [sec("Diva on screen — I drink 3s", 3, "self")], False),
 (18, "Danhausen",
  "If Danhausen appears everyone drink.",
  [sec("Danhausen! Everyone drinks 3s", 3, "all")], False),
 (19, "Defeat",
  "If your chosen wrestler loses drink for 5 seconds.",
  [sec("My wrestler lost — I drink 5s", 5, "self")], False),
 (20, "Spanish Announce Table Broken",
  "Down your beer if the Spanish announcer table is broken.",
  [down("Table's broken — I down it")], False),

 (21, "Legendary Bloodline",
  "If your chosen wrestler is from a legendary bloodline drink for 3 seconds.",
  [sec("Legendary bloodline — I drink 3s", 3, "self")], False),
 (22, "Former World Champion",
  "If your wrestler is a former world champion drink for 3 seconds.",
  [sec("Former champ — I drink 3s", 3, "self")], False),
 (23, "Finisher Reversed",
  "If your wrestlers finisher is reversed drink for 3 seconds.",
  [sec("Finisher reversed — I drink 3s", 3, "self")], False),
 (24, "Heel Turn",
  "You pick a player of your choice to drink for 3 seconds.",
  [sec("Pick someone to drink 3s", 3, "choose")], True),

 (25, "Tag Team",
  "Pick a friend to join your tag. Your next drink is doubled and passed onto someone else of your team's choice.",
  [note("Pick my tag partner", "choose")], True),
 (26, "Papi and Dixie",
  "Drink for 3 seconds if a wrestler appears with glasses (sunglasses count).",
  [sec("Glasses spotted — I drink 3s", 3, "self")], False),
 (27, "Jude",
  "Jude drinks for 3 seconds if a bald wrestler appears.",
  [sec("Bald wrestler — Jude drinks 3s", 3, "choose")], False),
 (28, "Rouse",
  "Rouse drinks for 3 seconds if an argument hand gesture occurs during the event.",
  [sec("Argument gesture — Rouse drinks 3s", 3, "choose")], False),

 (29, "Double Team",
  "If you have this card and a double team move occurs give out two drinks to two players of your choice.",
  [sec("Double team — two players drink 3s", 3, "many")], False),
 (30, "High Flying",
  "If a high flying move is performed give out a two second drink.",
  [sec("High flyer — give out 2s", 2, "choose")], False),
 (31, "Banger Theme",
  "If your chosen wrestlers theme song is a banger you must drink for 5 seconds.",
  [sec("It's a banger — I drink 5s", 5, "self")], False),
 (32, "Real Name?",
  "If you don't know your chosen wrestlers real name you must take a drink.",
  [sec("No idea — I drink 3s", 3, "self")], False),

 (33, "Vegas Reunion",
  "If a wrestler appears that we met in Las Vegas or seen in a casino drink for 3 seconds.",
  [sec("Vegas reunion — I drink 3s", 3, "self")], False),
 (34, "Money in the Bank",
  "If your chosen wrestler wins the Money in the Bank everyone else must drink for 5 seconds.",
  [sec("My wrestler won it — everyone else drinks 5s", 5, "others")], False),
 (35, "Botch!",
  "Drink for 3 seconds if a botch occurs.",
  [sec("Botch — I drink 3s", 3, "self")], False),
 (36, "Two Count!",
  "Drink every time there is a two count.",
  [sec("Two count — I drink 3s", 3, "self")], False),

 (37, "Table or Ladder!",
  "Drink for 5 seconds if your wrestler is put through a table or ladder.",
  [sec("Through a table — I drink 5s", 5, "self")], False),
 (38, "Small Package!",
  "Down your drink for a small package or any type of roll up.",
  [down("Roll up — I down it")], False),
 (39, "Ladder Leap!",
  "Give out a 5 second drink if your wrestler jumps off a ladder.",
  [sec("Off the ladder — give out 5s", 5, "choose")], False),
 (40, "Nip Up!",
  "Take a drink for a nip up.",
  [sec("Nip up — I drink 3s", 3, "self")], False),

 (41, "Mexican / Canadian Destroyer!",
  "Drink for 3 seconds if your wrestler is hit by any sort of Mexican / Canadian destroyer.",
  [sec("Destroyer — I drink 3s", 3, "self")], False),
 (42, "3 Amigos!",
  "Drink for 3 amigos.",
  [sec("Three amigos — I drink 3s", 3, "self")], False),
 (43, "Briefcase Hug!",
  "If your wrestler wins the Money in the Bank and finishes by hugging the referee with the briefcase choose someone to down their drink.",
  [down("Briefcase hug — they down it", "choose")], True),
 (44, "Hot Tag!",
  "Drink for a hot tag.",
  [sec("Hot tag — I drink 3s", 3, "self")], False),

 (45, "Cash in Same Night!",
  "Down your drink if your Money in the Bank winner cashes in the same night.",
  [down("Cashed in — I down it")], False),
 (46, "Hot Tag!",
  "Hot tag! You can choose someone to tag in and give half of your drinking penalty too.",
  [note("Tag someone in — split my penalty", "choose")], True),
 (47, "Rope Break!",
  "Call rope break if your called upon for a drink and the drink will be passed onto the person on your left.",
  [note("Rope break — pass it left", "left")], True),
 (48, "No Sell!",
  "If someone gives you drinks use this card to no sell and give them the drinks in return.",
  [note("No sell — send it back", "choose")], True),

 (49, "You Are Cursed!",
  "Play this card on somebody and they must take the next 3 drink punishments.",
  [note("Curse a player", "choose")], True),
 (50, "WWE Champion!",
  "You are the champion! You can create one drinking rule that everyone must abide by for the event.",
  [note("Declare my rule")], True),
 (51, "Title Match Penalty!",
  "Your drinking penalties are doubled during title matches.",
  [note("Acknowledge — my penalties double in title matches")], False),
 (52, "Pass the Penalty!",
  "If you win a mini game your title match drinking penalty is passed onto the loser of the mini game.",
  [note("Pass my title match penalty on", "choose")], False),
]


# --------------------------------------------------------------------------
# MINI GAMES — drawn one per turn and played out loud, then someone taps the
# outcome. Cards with a succeed/fail split get one button for each.
# --------------------------------------------------------------------------

def naming(n, title, text, seconds, target="choose", label=None):
    return (n, title, text, [sec(label or f"Loser drinks {seconds}s", seconds, target)])

MINI = [
 (1, "Tag Team Throwdown",
  "Pick a tag partner. You must go back and forth naming tag teams against two other players. The first team to fail or repeat loses.",
  [sec("Losing team drinks 5s", 5, "many")]),
 naming(2, "Catchphrase Chaos",
  "Take turns naming wrestler catchphrases. The first person to fail or repeat loses.", 3),
 naming(3, "Royal Rumble Royalty",
  "Take turns naming Royal Rumble winners. The first person to fail or repeat loses.", 30),
 (4, "One Name Only",
  "The players to your left and right will take turns against each other naming wrestlers with one name. The first person to fail or repeat loses.",
  [down("Loser takes a shot", "choose")]),

 (5, "ECW Legends",
  "Take turns naming ECW legends. The first person to fail or repeat loses.",
  [down("Loser downs their can and smashes it across their head", "choose")]),
 (6, "Wrestling Families",
  "Take turns naming wrestlers from wrestling families (e.g. fathers & sons, brothers, cousins, etc.). The first person to fail or repeat loses.",
  [sec("Loser drinks 1s per Bloodline member named", 1, "choose")]),
 (7, "Deceased Wrestlers",
  "Take turns naming deceased wrestlers. The first person to fail or repeat loses.",
  [down("Loser downs their can in memory of the dead", "choose")]),
 (8, "Wrestler Nicknames",
  "Take turns naming wrestlers nicknames. The first person to fail or repeat loses.",
  [sec("Loser drinks 1s per letter of their nickname", 1, "choose"),
   down("No nickname — down the can", "choose")]),

 (9, "Non American Wrestlers",
  "Take turns naming non American wrestlers (from any country outside the United States). The first person to fail or repeat loses.",
  [sec("Loser drinks the flight time to that wrestler's country", 10, "choose")]),
 (10, "Finishing Moves",
  "Take turns naming wrestlers finishing moves (e.g. Stone Cold Stunner, RKO, Pedigree, Spear, etc). The first person to fail or repeat loses.",
  [down("Loser finishes their can", "choose")]),
 (11, "Elimination Chamber",
  "Keep naming people who have participated in an Elimination Chamber match. Continue until only one player is left standing.",
  [sec("Everyone eliminated drinks 6s", 6, "many")]),
 naming(12, "WCW & WWE Legends",
  "Take turns naming wrestlers who have appeared in both WCW and WWE. The first person to fail or repeat loses.", 5),

 naming(13, "Match Stipulations",
  "Take turns against the person to your left naming wrestling match stipulations (e.g. steel cage, TLC, Hell in a Cell, etc.). The first person to fail or repeat loses.", 4),
 (14, "Wrestling Factions",
  "Take turns naming wrestling factions (e.g. The Shield, Evolution, DX, etc.). If you fail or repeat, the player to your right has 30 seconds to name as many nWo members as they can.",
  [sec("Loser drinks 1s per nWo member named", 1, "choose")]),
 (15, "A-Z Wrestlers",
  "Take turns naming wrestlers in alphabetical order (A–Z). Keep going until only one player is left. If you fail or repeat, you're out for this round.",
  [sec("Eliminated players drink 5s", 5, "many"),
   sec("Second round — 10s each", 10, "many"),
   sec("Third round — 15s each", 15, "many")]),
 (16, "Managers & General Managers",
  "Take turns naming wrestling managers and general managers (e.g. Paul Heyman, Vickie Guerrero, Eric Bischoff, Adam Pearce, etc.). If you fail or repeat, the player to your right becomes your manager and decides how long you drink.",
  [sec("Loser drinks — manager decides", 5, "choose")]),

 (17, "Money in the Bank Cash In",
  "Just like a real cash in... Pick any player to drink for 5 seconds.",
  [sec("They drink 5s", 5, "choose")]),
 (18, "Reversal",
  "Just like in the ring... you reversed a finisher! Pick any player to drink for 5 seconds.",
  [sec("They drink 5s", 5, "choose")]),
 (19, "Heel Turn",
  "You've turned heel! Pick a friend to drink for 5 seconds.",
  [sec("They drink 5s", 5, "choose")]),
 (20, "Faction Formed",
  "You and the players to your left and right have formed a faction! Pick any player to drink for 5 seconds.",
  [sec("They drink 5s", 5, "choose")]),

 naming(21, "WWE & TNA Crossovers",
  "Take turns naming wrestlers who have been in both WWE and TNA. Keep going until one player is left.", 5, "many", "Losers drink 5s"),
 naming(22, "Gimmicked Up",
  "Take turns naming wrestlers with gimmicks (e.g. The Undertaker, Doink, Mankind, etc.). Keep going until one player is left.", 5, "many", "Losers drink 5s"),
 naming(23, "Female Wrestlers",
  "Take turns naming female wrestlers (past or present). The first person to fail or repeat loses.", 5),
 naming(24, "ECW & WWE Double Duty",
  "Take turns naming wrestlers who have wrestled in both ECW and WWE. Keep going until one player is left.", 5, "many", "Losers drink 5s"),

 (25, "Submission Specialists",
  "Take turns naming wrestler finisher or signature submissions (e.g. Sharpshooter, STF, Ankle Lock, etc.). The first person to fail or repeat loses.",
  [down("Loser taps out and downs their can", "choose")]),
 naming(26, "Masked Wrestlers",
  "Take turns naming wrestlers who have worn a mask (past or present). The first person to fail or repeat loses.", 5),
 naming(27, "Multiple Characters",
  "Take turns naming wrestlers who have used two different characters or gimmicks (e.g. Kane/The Undertaker, Mankind/Cactus Jack, etc.). Keep going until there are two players left.", 5, "many", "Losers drink 5s"),
 naming(28, "Black Wrestlers",
  "Take turns naming Black wrestlers (past or present). Keep going until one player is left. Hot tag rule: the winner can save one player from drinking.", 5, "many", "Losers drink 5s"),

 (29, "Kayfabe Relatives",
  "Take turns naming kayfabe wrestling relatives (e.g. brothers, fathers, sons, cousins, etc.). The first person to fail or repeat loses.",
  [sec("Loser drinks 5s", 5, "choose"),
   sec("...and picks a relative to drink with them", 5, "choose")]),
 (30, "One on One With the Undertaker",
  "Take turns naming The Undertaker's WrestleMania opponents. If you fail or repeat, you drink for the same number of seconds as the WrestleMania number of the last correct opponent mentioned.",
  [sec("Loser drinks the WrestleMania number", 28, "choose")]),
 (31, "Supernatural Characters",
  "Take turns naming supernatural characters (in WWE or other wrestling). Keep going until one player is left.",
  [note("Winner may double the drinks for the loser of the next round")]),
 (32, "Wrestling Couples",
  "Take turns with the person to your left naming wrestling couples (real life or kayfabe). The first person to fail or repeat loses.",
  [sec("Loser picks a partner — both drink 5s", 5, "many")]),

 (33, "Bald Wrestlers",
  "Take turns naming bald wrestlers (past or present). The first person to fail or repeat loses.",
  [sec("Loser drinks 4s", 4, "choose"), sec("If Jude lost — 8s", 8, "choose")]),
 (34, "Asian Wrestlers",
  "Take turns naming Asian wrestlers (past or present). The first person to fail or repeat loses.",
  [sec("Loser does their best Japanese accent and drinks 5s", 5, "choose")]),
 (35, "Attitude Era Wrestlers",
  "Take turns naming Attitude Era wrestlers (1997 – 2002). The first person to fail or repeat loses.",
  [down("Loser downs their can in the name of the Attitude Era", "choose")]),
 (36, "Last Man Standing",
  "Take turns naming former WWE / World Heavyweight champions (past or present). Keep going until there is one person left – the last man standing.",
  [sec("Winner picks anyone to drink 5s", 5, "choose")]),

 (37, "Cruiserweight Challenge",
  "The person to your right has 15 seconds to name 8 former WWE Cruiserweight champions.",
  [sec("They named 8 — I drink 8s", 8, "self"),
   sec("They failed — they drink 8s", 8, "right")]),
 (38, "Nexus Roll Call",
  "The person to your left has 10 seconds to name 5 members of Nexus.",
  [sec("They succeeded — I drink 5s", 5, "self"),
   sec("They failed — they drink 5s", 5, "left")]),
 (39, "Count Out",
  "Count out! The person to your right drinks for 10 seconds.",
  [sec("They drink 10s", 10, "right")]),
 (40, "3 Count",
  "3 count! The person to your left drinks for 3 seconds.",
  [sec("They drink 3s", 3, "left")]),

 (41, "Triple Company Challenge",
  "Pick 3 opponents. Take turns naming wrestlers who have been in all three: TNA, WCW and WWE. The first person to fail or repeat loses.",
  [sec("Losers drink 9s — 3s per company", 9, "many")]),
 naming(42, "Title Roll Call",
  "Take turns naming current and former WWE titles (singles, tag team, women's, and any other official titles). The first person to fail or repeat loses.", 4),
 (43, "Slow Ref Count",
  "The referee starts a slow count! The person to your right drinks for 5 seconds.",
  [sec("They drink 5s", 5, "right")]),
 naming(44, "Commentary Call",
  "Take turns naming current and former wrestling commentators (WWE, WCW, TNA, AEW, etc.). The first person to fail or repeat loses.", 5),

 (45, "Weapons Challenge",
  "The person to your left has 15 seconds to name 10 weapons used in wrestling.",
  [sec("They succeeded — I drink 5s", 5, "self"),
   sec("They failed — they drink 5s", 5, "left")]),
 (46, "Wrestling Companies",
  "The person to your right and left must go back and forth naming wrestling companies (past & present).",
  [sec("Whoever failed drinks 5s", 5, "choose")]),
 (47, "You're Fired!",
  "Whoever draws this card must drink for 5 seconds.",
  [sec("I drink 5s", 5, "self")]),
 (48, "Wrestlers & Movies",
  "Take turns going back and forth naming wrestlers and movies they have starred in.",
  [sec("Whoever failed drinks 3s", 3, "choose")]),

 (49, "Referee Rumble",
  "The players to your left and right must take turns naming referees. The first person to lose must get a 3 count and drink for 3 seconds.",
  [sec("Loser takes the 3 count and drinks 3s", 3, "choose")]),
 (50, "9 to 5",
  "Take turns naming wrestlers who have another profession as their gimmick (e.g. cop, doctor, teacher, plumber, etc.). The first person to lose must drink for 8 seconds in the name of an 8-hour work shift.",
  [sec("Loser drinks 8s", 8, "choose")]),
 (51, "Hart Family Challenge",
  "The person to your left has 10 seconds to name 5 members of the Hart family.",
  [sec("They succeeded — I drink 5s", 5, "self"),
   sec("They failed — they drink 5s", 5, "left")]),
 (52, "Wrestler Name Game",
  "Go back and forth naming wrestlers until one person is left. The next wrestler must begin with the last letter of the previous wrestler's name. Example: Jeff Hardy → the next wrestler must begin with H.",
  [sec("Last standing dishes out 20s among the losers", 20, "many")]),

 (53, "Irish Wrestlers",
  "Take turns naming Irish wrestlers. The first person to fail or repeat must drink for 3 seconds.",
  [sec("Loser drinks 3s", 3, "choose")]),
 (54, "Wrestler Name Game Part 2",
  "Go back and forth naming wrestlers until one person is left. The next wrestler must begin with the last letter of the previous wrestler's name.",
  [sec("Last standing dishes out 20s among the losers", 20, "many")]),
 (55, "General Manager Mode",
  "You are in General Manager mode. You may pick another player to drink for 3 seconds.",
  [sec("They drink 3s", 3, "choose")]),
 (56, "Taboo Tuesday",
  "The group must vote on who drinks for 5 seconds. The person with the most votes must drink.",
  [sec("Most votes drinks 5s", 5, "vote")]),

 (57, "English Wrestlers",
  "The persons to your left and right must take turns naming English wrestlers. The first person to fail or repeat must drink for 3 seconds.",
  [sec("Loser drinks 3s", 3, "choose")]),
 (58, "WWE PPV Challenge",
  "The person to your left has 20 seconds to name 10 WWE PPVs.",
  [sec("They succeeded — I drink 5s", 5, "self"),
   sec("They failed — they drink 5s", 5, "left")]),
 (59, "TNA PPV Challenge",
  "The person to your right must name 3 TNA PPVs.",
  [sec("They succeeded — I drink 3s", 3, "self"),
   sec("They failed — they drink 3s", 3, "right")]),
 (60, "WCW PPV Challenge",
  "You must name 3 WCW PPVs.",
  [sec("I named them — hand out 5s", 5, "many"),
   sec("I failed — I drink 5s", 5, "self")]),

 (61, "King of the Ring Winners",
  "Take turns naming King of the Ring winners until one person is left. The last person standing is the King of the Ring and picks who drinks.",
  [sec("King picks a player to drink 5s", 5, "choose")]),
 (62, "Wrestlers You Would Beat",
  "Take turns naming wrestlers you think you would beat in a fight. Continue until the majority of the group disagrees that you would win.",
  [sec("First to lose drinks 5s", 5, "choose")]),
 (63, "Botch!",
  "Drink for 3 seconds.",
  [sec("I drink 3s", 3, "self")]),
 (64, "Montreal Screw Job",
  "Pick a player to drink for 3 seconds. If you pick yourself, you screwed yourself... and the drink is doubled and passed back onto you.",
  [sec("They drink 3s", 3, "choose"), sec("I screwed myself — 6s", 6, "self")]),

 (65, "That's Not Going to Work For Me Brother",
  "You get to skip the 3 drinks for this one as you refuse to do the job and pass it to the person to your left.",
  [sec("Pass it left — they drink 3s", 3, "left")]),
 (66, "Burying Talent",
  "The worst performer of the game so far must pay their dues and drink for 3 seconds.",
  [sec("Worst performer drinks 3s", 3, "choose")]),
 (67, "Vacated Championship",
  "Finish your drink and declare you can vacant.",
  [down("I finish my drink")]),
 (68, "Botchamania",
  "You botched WrestleMania. Your drinking losses are doubled for the next 5 minutes.",
  [note("Start the 5 minutes — my drinks are doubled")]),

 (69, "Tribal Chief",
  "You must refer to the person to your left as your Tribal Chief until you win a mini game. Anytime you call them by any other name you must drink.",
  [sec("I slipped up — I drink 3s", 3, "self")]),
 (70, "The Shield",
  "Pick two other players to take 4 drinks with you.",
  [sec("The three of us drink 4s", 4, "many")]),
 (71, "The Jobber",
  "For the next 5 mini games you must take a drink.",
  [sec("Jobbing again — I drink 3s", 3, "self")]),
 (72, "Double Count Out",
  "You and the person to your right must drink for 4 seconds.",
  [sec("We both drink 4s", 4, "selfright")]),

 (73, "Outside WWE",
  "Name a wrestler who never wrestled in WWE.",
  [sec("I named one — hand out 5 drinks", 5, "many"),
   sec("I couldn't — I take 5 drinks", 15, "self")]),
 (74, "You Are Cursed",
  "Danhausen picks someone to drink for 3 seconds.",
  [sec("They drink 3s", 3, "choose")]),
 (75, "Animal Instincts",
  "Name 5 animal related wrestlers.",
  [note("I named 5 — nothing happens"),
   sec("I couldn't — I drink 5s", 5, "self")]),
 (76, "Legend Killer",
  "The oldest person in the room must drink for 3 seconds.",
  [sec("Oldest player drinks 3s", 3, "choose")]),
]


def build():
    cards = []
    for n, title, text, outcomes, once in EVENT:
        cards.append({
            "id": f"event-{n:02d}", "deck": "event", "n": n,
            "title": title, "text": text,
            "image": f"cards/event-{n:02d}.webp",
            "once": once, "outcomes": outcomes,
        })
    for entry in MINI:
        n, title, text, outcomes = entry
        cards.append({
            "id": f"mini-{n:02d}", "deck": "mini", "n": n,
            "title": title, "text": text,
            "image": f"cards/mini-{n:02d}.webp",
            "outcomes": outcomes,
        })
    return cards


if __name__ == "__main__":
    cards = build()
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "cards", "deck.json")
    with open(out, "w") as fh:
        json.dump(cards, fh, indent=1, ensure_ascii=False)

    missing = [c["image"] for c in cards
               if not os.path.exists(os.path.join(here, "..", c["image"]))]
    events = [c for c in cards if c["deck"] == "event"]
    minis = [c for c in cards if c["deck"] == "mini"]
    print(f"{len(cards)} cards -> cards/deck.json")
    print(f"  event: {len(events)}  (one-shot: {sum(1 for c in events if c['once'])})")
    print(f"  mini : {len(minis)}")
    if missing:
        raise SystemExit(f"MISSING IMAGES: {missing}")
    print("  every card has its image")
