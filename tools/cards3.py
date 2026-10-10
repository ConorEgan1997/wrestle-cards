"""
The cards3.1 set, catalogued from the contact sheets in work/contact.

Entries are in the exact order the split produced them (work/cards.json), which
is the order the contact sheets tile in: eight across, then down. Pairing is
positional, so a wrong entry shifts everything after it — tools/check-order.py
renders each card with the title this file claims for it so the whole lot can
be eyeballed in one pass.

  kind: P private player card, V PPV action, B money in the bank, M mini game
  (kind, number, title, seconds, target)

seconds: the drink printed on the card. 0 means the card does something other
than hand out a timed drink; None means "down your drink".
target:  who it lands on, in the engine's vocabulary — self, choose, many, all,
         others, left, right, vote.
"""

DOWN = None

CARDS = [
 # ---- contact sheet c00 ----
 ('P',21,"Referee",3,'choose'), ('P',22,"Montreal Screwjob",0,'choose'),
 ('P',23,"Steiner Maths",3,'many'), ('P',24,"Legend Killer",3,'choose'),
 ('M',355,"Paul Heyman",3,'right'), ('M',356,"Brutus Barber Beefcake",3,'choose'),
 ('M',357,"A Wild Slapnuts Appears",3,'self'), ('M',358,"King Booker",3,'self'),

 ('M',223,"The Betrayal Vote",3,'vote'), ('M',224,"The Heel Vote",2,'vote'),
 ('M',225,"The Babyface Vote",2,'vote'), ('M',226,"Tough Enough",2,'self'),
 ('V',21,"Former World Champion",2,'self'), ('V',22,"Finisher Reserved",3,'self'),
 ('V',23,"Appears With Glasses",2,'choose'), ('V',24,"Bald Wrestler",2,'choose'),

 ('M',456,"General Manager Has Banned You",3,'choose'), ('M',457,"NXT > Main Roster",2,'choose'),
 ('M',458,"Forever Young",3,'choose'), ('M',459,"Rivals Of Rey Mysterio",2,'choose'),
 ('M',369,"Macho Man Randy Savage",3,'many'), ('M',370,"Dave Meltzer Of The Game",3,'choose'),
 ('M',371,"Dave Meltzer Lowest Rating",3,'choose'), ('M',372,"Slammy Awards",4,'many'),

 ('M',421,"I Quit Match",3,'all'), ('M',422,"Wrestlers Beginning With A",3,'choose'),
 ('M',433,"Wrestlers Beginning With M",3,'choose'), ('M',434,"Wrestlers Beginning With L",3,'choose'),
 ('M',319,"Who Did They Take It From? Randy Orton",3,'choose'),
 ('M',320,"Who Did They Take It From? Goldberg",3,'choose'),
 ('M',321,"Who Did They Take It From? Rey Mysterio",3,'choose'),
 ('M',322,"Who Did They Take It From? Brock Lesnar",3,'choose'),

 ('M',259,"Wrestler Name Chain",3,'choose'), ('M',260,"Wrestler Name Chain",3,'choose'),
 ('M',261,"Wrestler Name Chain",3,'choose'), ('M',262,"Wrestler Name Chain",3,'choose'),
 ('M',93,"Jeff Cobb Tells You To Drink",3,'choose'), ('M',94,"The Boogeyman Got You",3,'self'),
 ('M',95,"Bad News Barrett",3,'self'), ('M',96,"Ask Reagan A Trivia Question",3,'choose'),

 ('V',9,"Turns Face",5,'self'), ('V',10,"Shenanigans Occur",3,'self'),
 ('V',11,"Product Placement",3,'self'), ('V',12,"Hit By A Finisher",5,'self'),
 ('M',351,"APA",3,'many'), ('M',352,"Kiss My Ass Club",3,'choose'),
 ('M',353,"UFC To WWE",3,'self'), ('M',354,"WWE To UFC",3,'self'),

 # ---- contact sheet c01 ----
 ('M',447,"Mythological Wrestlers",3,'choose'), ('M',448,"American Cities Or States Wrestlers",3,'choose'),
 ('M',449,"Trish Stratus First Crush",3,'self'), ('M',450,"Boxers In Wrestling",3,'all'),
 ('V',77,"Playing Possum",3,'all'), ('V',78,"Low Blowed",3,'self'),
 ('V',79,"Eye Poke",3,'self'), ('V',80,"Criminal Record",2,'self'),

 ('M',439,"Shawn Michaels In 96",0,'self'), ('M',440,"Bret Screwed Bret",0,'self'),
 ('M',441,"Name A Wrestler You Hate",3,'all'), ('M',442,"80s / Early 90s Gimmick",3,'self'),
 ('M',443,"Attitude Era Gimmick That Wouldn't Fly Today",3,'self'), ('M',444,"ECW PPVs",3,'self'),
 ('M',445,"Weather Wrestlers",3,'choose'), ('M',446,"Planet Wrestlers",3,'choose'),

 ('M',303,"Initials Battle",2,'choose'), ('M',304,"Initials Battle",2,'choose'),
 ('M',305,"Initials Battle",2,'choose'), ('M',306,"Initials Battle",2,'choose'),
 ('V',61,"Replacement Referee",3,'self'), ('V',62,"Before The Bell",3,'self'),
 ('V',63,"Former Partner",3,'all'), ('V',64,"Exposed Turnbuckle",3,'self'),

 ('V',49,"Comes With A Manager",3,'others'), ('V',50,"Comes With A Celebrity",2,'self'),
 ('V',51,"Manager Ejected",5,'self'), ('V',52,"Stretcher",3,'self'),
 ('M',37,"Cruiserweight Champions Challenge",8,'right'), ('M',38,"Nexus Members Challenge",5,'left'),
 ('M',39,"Count Out",10,'right'), ('M',40,"3 Count",3,'left'),

 ('M',359,"JBL's Stance On Borders",3,'self'), ('M',360,"The Mick Foley Of The Game",3,'choose'),
 ('M',464,"Mae Young Gave Birth To Your Hand",2,'self'), ('M',465,"What?",3,'self'),
 ('M',255,"Guess Referee",0,'choose'), ('M',256,"I Can Name Light Heavyweight Champions",3,'choose'),
 ('M',257,"Kayfabe Crimes",3,'choose'), ('M',258,"General Manager",2,'many'),

 ('M',361,"Fictional Places",2,'choose'), ('M',362,"No Fucking Way Patrick Gilmartin",3,'choose'),
 ('M',363,"No Fucking Way Jordan Dunbar",3,'choose'), ('M',364,"Soul Survivor",3,'many'),
 ('B',1,"Money In The Bank Winner",5,'others'), ('B',2,"Ladder Jump",5,'choose'),
 ('B',3,"Through A Ladder",5,'self'), ('B',4,"Briefcase Celebration",5,'self'),
]

CARDS += [
 # ---- contact sheet c02 ----
 ('M',389,"The Basham Bros",3,'choose'), ('M',390,"Name A Wrestler Beginning With B",3,'choose'),
 ('M',391,"Name A Wrestler Beginning With C",3,'choose'), ('M',392,"Heath Slater I Got Kids",3,'many'),
 ('M',165,"You Just Got Jimmy Wang Yanged",3,'choose'), ('M',166,"Name Those Redneck Wrestlers",2,'choose'),
 ('M',167,"VAR",3,'choose'), ('M',168,"F, M, K",3,'self'),

 ('M',401,"F, M, K",3,'choose'), ('M',402,"F, M, K",3,'choose'),
 ('M',403,"F, M, K",3,'choose'), ('M',404,"Steve Blackman Bounty Hunter",3,'self'),
 ('M',331,"Jordan Drink 3 Seconds For Shark Boy",3,'choose'), ('M',332,"Top Rope Move Battle",3,'choose'),
 ('M',333,"Numbered Move Battle",3,'choose'), ('M',334,"Mount Rushmore Tag Teams",2,'self'),

 ('V',1,"Submission Finisher",0,'self'), ('V',2,"German Suplex",3,'self'),
 ('V',3,"Lose The Title",DOWN,'self'), ('V',4,"Win The Title",5,'choose'),
 ('M',49,"Wrestling Referees Challenge",3,'choose'), ('M',50,"Wrestlers With Jobs For Gimmicks Challenge",8,'choose'),
 ('M',51,"Hart Family Challenge",5,'choose'), ('M',52,"Wrestler Name Game",20,'many'),

 ('M',373,"Lie, Cheat, Steal Pt 4",0,'self'), ('M',374,"Group Vote",3,'vote'),
 ('M',375,"Name 3 Disability Wrestlers",3,'choose'), ('M',376,"Name 3 Australian Wrestlers",3,'choose'),
 ('M',17,"Money In The Bank Cash In",5,'choose'), ('M',18,"Reversal",5,'left'),
 ('M',19,"You've Turned Heel",5,'choose'), ('M',20,"Faction Formed",5,'choose'),

 ('M',85,"Wrestling Connection Tag Team Edition",5,'choose'), ('M',86,"Wrestling Connection Rival Edition",5,'choose'),
 ('M',87,"Wrestling Connection Championship Edition",5,'choose'), ('M',88,"Name Two Wrestlers",5,'choose'),
 ('V',69,"Shushes The Crowd",3,'choose'), ('V',70,"Foreign Announcers",3,'self'),
 ('V',71,"Under 60 Seconds",DOWN,'self'), ('V',72,"Steel Steps",2,'self'),

 ('V',29,"Botch",3,'self'), ('V',30,"Two Count",2,'self'),
 ('V',31,"One Count",3,'self'), ('V',32,"Small Package",DOWN,'self'),
 ('V',53,"Returns To The Match",3,'others'), ('V',54,"Legitimate Injury",DOWN,'self'),
 ('V',55,"Barricade Brawl",3,'all'), ('V',56,"Wardrobe Malfunction",3,'all'),

 # ---- contact sheet c03 ----
 ('B',9,"Multiple Entries",3,'self'), ('B',10,"First Time",3,'self'),
 ('B',11,"Cashed In On",DOWN,'self'), ('B',12,"Ring Wipeout",3,'others'),
 ('B',13,"Through Own Set Up",3,'self'), ('B',14,"Ladder Spin",3,'self'),
 ('B',15,"Former Mr/Mrs MITB",3,'self'), ('B',16,"Finisher Off A Ladder",10,'self'),

 ('V',57,"Hit By Mist",3,'self'), ('V',58,"Manager Hit By Finisher",3,'self'),
 ('V',59,"Own Finisher",5,'self'), ('V',60,"Super Finisher",10,'self'),
 ('M',57,"English Wrestlers Challenge",3,'choose'), ('M',58,"WWE PPV Challenge",5,'left'),
 ('M',59,"TNA PPV Challenge",3,'right'), ('M',60,"WCW PPV Challenge",3,'left'),

 ('M',365,"United States Billings",3,'many'), ('M',366,"Montell Vontavious Porter",3,'choose'),
 ('M',367,"Damn! Ron Simmons",3,'choose'), ('M',368,"Son Of A Plumber",3,'choose'),
 ('M',315,"Wrestler Tenable: Intercontinental Reigns",5,'many'), ('M',316,"Wrestler Tenable: United States Reigns",5,'many'),
 ('M',317,"Wrestler Tenable: Women's Championship",5,'many'), ('M',318,"Wrestler Tenable: 24/7 Championship",5,'many'),

 ('M',41,"WWE, TNA & WCW Wrestlers Challenge",3,'choose'), ('M',42,"Wrestling Titles Challenge",3,'choose'),
 ('M',43,"Corrupt Referee Challenge",5,'right'), ('M',44,"Wrestling Commentators Challenge",3,'choose'),
 ('M',243,"F, M, K",2,'choose'), ('M',244,"F, M, K",2,'choose'),
 ('M',245,"F, M, K",2,'choose'), ('M',246,"5x World Champ",5,'self'),

 ('M',69,"The Jobber",3,'self'), ('M',70,"Double Count Out",5,'many'),
 ('M',71,"Never In WWE",3,'choose'), ('M',72,"You Are Cursed!",3,'choose'),
 ('M',235,"U Can't C Me",0,'self'), ('M',236,"The Cody Rhodes",2,'choose'),
 ('M',237,"The Brock Lesnar",3,'choose'), ('M',238,"F, M, K",2,'choose'),

 ('P',5,"High Flying Move",2,'choose'), ('P',6,"Hot Tag!",0,'choose'),
 ('P',7,"Rope Break!",0,'left'), ('P',8,"No Sell!",0,'choose'),
 ('M',409,"Submission Move",3,'many'), ('M',410,"TNA 6 Sided Ring",3,'choose'),
 ('M',411,"Wrestling Theme Songs",3,'self'), ('M',412,"3 Minute Warning",3,'choose'),
]

CARDS += [
 # ---- contact sheet c04 ----
 ('P',13,"This Card Must Always Be Assigned To Papi!",3,'choose'), ('P',14,"Cheap Heat",2,'choose'),
 ('P',15,"Hum A Theme Song",2,'many'), ('P',16,"Offer A Heel Turn",3,'choose'),
 ('M',227,"Ruthless Aggression Era Gimmick",2,'self'), ('M',228,"Attitude Era Gimmick",2,'self'),
 ('M',229,"Mr Ass Billy Gunn",3,'many'), ('M',230,"The Nature Boy",3,'self'),

 ('P',17,"Heel & Face",3,'many'), ('P',18,"Mr McMahon",2,'choose'),
 ('P',19,"Babyface Duties",0,'self'), ('P',20,"Bad News Barrett",0,'choose'),
 ('M',45,"Wrestling Weapons Challenge",5,'left'), ('M',46,"Wrestling Companies Challenge",5,'choose'),
 ('M',47,"Your Fired!",5,'self'), ('M',48,"Wrestlers In Movies Challenge",3,'choose'),

 ('M',307,"Wrestler Tenable: Hardcore Reigns",5,'many'), ('M',308,"Wrestler Tenable: Tag Title Reigns",5,'many'),
 ('M',309,"Wrestler Tenable: World Title Wins",5,'many'), ('M',310,"Wrestler Tenable: Royal Rumble Appearances",5,'many'),
 ('M',291,"JD Don't Google Me McDoangh",3,'choose'), ('M',292,"Is That Justin Roberts Or Josh Matthews?",2,'choose'),
 ('M',293,"Wrong Winner",3,'choose'), ('M',294,"Pick A Tag Partner",0,'choose'),

 ('M',323,"Who Did They Take It From? John Cena",3,'choose'), ('M',324,"Who Did They Take It From? Eddie Guerrero",3,'choose'),
 ('M',325,"Who Did They Take It From? Chris Benoit",3,'choose'), ('M',326,"Who Did They Take It From? Kofimania",3,'choose'),
 ('V',33,"Nip Up",3,'self'), ('V',34,"3 Amigos",3,'all'),
 ('V',35,"Hot Tag",3,'self'), ('V',36,"Canadian / Mexican Destroyer Or A Code Red",3,'many'),

 ('M',271,"Matt Strongly Dislikes Mustard",3,'many'), ('M',272,"Pour One Up For The Las Vegas Trip",3,'all'),
 ('M',273,"JCW Juggalo Championship Wrestling",3,'choose'), ('M',274,"Fruity Wrestlers",3,'choose'),
 ('M',206,"Name 3 Paul Heyman Guys",3,'self'), ('M',207,"Rank The 3 Faces Of Foley",3,'choose'),
 ('M',209,"The Shawn Michaels",3,'choose'), ('M',210,"The Batista",2,'choose'),

 ('M',247,"Group Vote",3,'vote'), ('M',248,"F, M, K",3,'choose'),
 ('M',249,"It Wasn't Your Fault",3,'choose'), ('M',250,"Rank These 5",3,'choose'),
 ('M',219,"Instant Replay",5,'choose'), ('M',220,"Vince McMahon Impression",3,'self'),
 ('M',221,"Low Blow",0,'choose'), ('M',222,"Rope Break",0,'choose'),

 # ---- contact sheet c05 ----
 ('M',1,"Tag Team Challenge",3,'many'), ('M',2,"Catchphrase Challenge",3,'choose'),
 ('M',3,"Royal Rumble Winners Challenge",DOWN,'choose'), ('M',4,"One Name Challenge",5,'choose'),
 ('M',311,"Wrestler Tenable: Royal Rumble Eliminations",5,'many'), ('M',312,"Wrestler Tenable: Tallest Wrestlers",5,'many'),
 ('M',313,"Wrestler Tenable: Most WWE PPV Editions",5,'many'), ('M',314,"Wrestler Tenable: Royal Rumble Wins",5,'many'),

 ('M',460,"Rivals Of Shawn Michaels",2,'choose'), ('M',461,"Rivals Of Stone Cold",2,'choose'),
 ('M',462,"Rivals Of Jeff Hardy",2,'choose'), ('M',463,"Rivals Of Vince McMahon",2,'choose'),
 ('V',17,"Danhausen Appears",3,'all'), ('V',18,"Your Wrestler Loses",3,'self'),
 ('V',19,"Spanish Announce Table Broke",3,'all'), ('V',20,"Legendary Bloodline",2,'self'),

 ('M',385,"Benoit Guilty",3,'many'), ('M',386,"Kane In 1997",3,'self'),
 ('M',387,"Charlotte Flair Husbands",3,'many'), ('M',388,"American Badass",3,'many'),
 ('M',77,"Category Challenge",5,'self'), ('M',78,"Wrestling Connection",5,'choose'),
 ('M',79,"United States Champions",3,'choose'), ('M',80,"A-Z Nicknames",5,'choose'),

 ('M',13,"Match Stipulations Challenge",3,'choose'), ('M',14,"Wrestling Factions Challenge",3,'choose'),
 ('M',15,"A-Z Wrestlers Challenge",5,'choose'), ('M',16,"Managers & GMs Challenge",5,'choose'),
 ('V',65,"Exposed Then Into It",3,'self'), ('V',66,"Hall Of Famer Appears",3,'self'),
 ('V',67,"Title Used As Weapon",3,'choose'), ('V',68,"Tag Team Reunites",3,'self'),

 ('M',347,"The Good Buddy Dave Heath Reagan",3,'choose'), ('M',348,"Shoutout Dixie For The App",3,'choose'),
 ('M',349,"Gimmick Change",3,'self'), ('M',350,"Last Man Standing",3,'choose'),
 ('M',25,"Finisher Or Submissions Challenge",DOWN,'choose'), ('M',26,"Masked Wrestlers Challenge",3,'choose'),
 ('M',27,"Two Characters Challenge",3,'many'), ('M',28,"African American Superstars Challenge",5,'many'),

 ('V',5,"Commentary Obvious",3,'self'), ('V',6,"DQ Or Counted Out",5,'self'),
 ('V',7,"Wrestler Returns",5,'all'), ('V',8,"Turns Heel",5,'self'),
 ('M',97,"Bigger Than Obama In 08",3,'all'), ('M',98,"One Up For Eddie Guerrero",3,'all'),
 ('M',99,"One Up For Chris Benoit",3,'all'), ('M',100,"Hi Guys Maven Here",3,'all'),
]

CARDS += [
 # ---- contact sheet c06 ----
 ('M',267,"Backstage Heat",3,'vote'), ('M',268,"The Drew McIntyre",3,'choose'),
 ('M',269,"Brock Lesnar Reagan",3,'choose'), ('M',270,"Kit Wilson Your Toxic",3,'choose'),
 ('V',37,"Backstage Assault",3,'self'), ('V',38,"Authority Interruption",3,'self'),
 ('V',39,"Suicide Dive",3,'self'), ('V',40,"Black Wrestling Star",3,'self'),

 ('M',283,"Three Stages Of Hell",0,'choose'), ('M',284,"Dixie Carter Says You Have To Drink",3,'choose'),
 ('M',285,"Inferno Match",3,'many'), ('M',286,"TLC",3,'many'),
 ('V',25,"Argumentative Hand Gesture",3,'choose'), ('V',26,"Banger Theme Song",2,'others'),
 ('V',27,"Real Name?",3,'self'), ('V',28,"Las Vegas, Casino, Bar Or On Street",2,'self'),

 ('M',65,"Pay Your Dues!",3,'choose'), ('M',66,"Declare Your Can Vacant!",DOWN,'self'),
 ('M',67,"You Botched WrestleMania!",0,'self'), ('M',68,"The Shield",3,'many'),
 ('M',393,"You Are The Iron Sheik",3,'choose'), ('M',394,"I Believe In Joe Hendry",3,'choose'),
 ('M',395,"Cyber Sunday",5,'vote'), ('M',396,"Big Bs Jacob Fatu",3,'many'),

 ('M',417,"1 On 1 With The Undertaker Playa",5,'choose'), ('M',418,"Father And Son Duos",5,'choose'),
 ('M',419,"Father And Daughter Duos",3,'choose'), ('M',420,"Tajiri's Mist",2,'choose'),
 ('M',53,"Irish Wrestlers Challenge",3,'choose'), ('M',54,"General Manager Mode",3,'choose'),
 ('M',55,"Wrestler Name Game Part 2",20,'many'), ('M',56,"Taboo Tuesday",5,'vote'),

 ('V',45,"Late Great Mentioned",3,'self'), ('V',46,"Slim Jim Advert",3,'self'),
 ('V',47,"Mask Assailant",5,'self'), ('V',48,"Wears A Mask",3,'self'),
 ('M',9,"Non American Wrestlers Challenge",5,'choose'), ('M',10,"Finishing Moves Challenge",DOWN,'choose'),
 ('M',11,"WWE & WCW Challenge",5,'choose'), ('M',12,"Money In The Bank Challenge",3,'choose'),

 ('M',215,"The Fingerpoke Of Doom",2,'choose'), ('M',216,"Good Ol' JR",2,'vote'),
 ('M',217,"Hulk Hogan Impersonation",3,'self'), ('M',218,"Stone Cold Impersonation",3,'self'),
 ('B',5,"Cash In Same Night",DOWN,'self'), ('B',6,"Failed Cash In",DOWN,'self'),
 ('B',7,"Solo Ladder Climb Men's",3,'all'), ('B',8,"Solo Ladder Climb Women's",3,'all'),

 # ---- contact sheet c07 ----
 ('M',279,"Foreign Heel Challenge",3,'self'), ('M',280,"Bobby The Brain Heenan",2,'vote'),
 ('M',281,"D-Von Get The Tables!!!",2,'choose'), ('M',282,"The Show Must Go On",3,'choose'),
 ('V',13,"The Bloodline Mentioned",3,'self'), ('V',14,"Cut Open",5,'self'),
 ('V',15,"Celebrity Spotted",3,'self'), ('V',16,"Attractive Diva Appears",3,'self'),

 ('M',405,"WrestleMania Main Events",3,'self'), ('M',406,"The Bloodline",3,'self'),
 ('M',407,"Smackdown vs Raw",3,'many'), ('M',408,"Ironman",3,'self'),
 ('M',263,"Pick A Protege",0,'choose'), ('M',264,"Faction Leader",2,'choose'),
 ('M',265,"Rank These 5",3,'choose'), ('M',266,"Rank These 5",3,'choose'),

 ('M',335,"Wrestler Pointless",2,'choose'), ('M',336,"The Billy & Chuck Card",2,'many'),
 ('M',337,"The Dirtiest Player In The Game",3,'choose'), ('M',338,"The Mouth Of The South Jimmy Hart",3,'choose'),
 ('V',41,"Asian Wrestling Star",3,'self'), ('V',42,"Latino Wrestling Star",3,'self'),
 ('V',43,"Holy Shit / This Is Awesome Chant",3,'self'), ('V',44,"Hometown Hero",3,'self'),

 ('M',377,"The Bins Are In Cahoots",3,'all'), ('M',378,"La Primera",3,'all'),
 ('M',379,"GM Restart",0,'self'), ('M',380,"Rank These UK Wrestlers",3,'choose'),
 ('M',239,"F, M, K",3,'choose'), ('M',240,"F, M, K",2,'choose'),
 ('M',241,"F, M, K",2,'choose'), ('M',242,"F, M, K",2,'choose'),

 ('M',287,"Hello My Name Is Eugene",3,'choose'), ('M',288,"3 vs 1 Handicapped Match",2,'many'),
 ('M',289,"Triple Threat Match",2,'many'), ('M',290,"Triple Threat Match",2,'many'),
 ('M',5,"ECW Originals Challenge",5,'choose'), ('M',6,"Wrestling Families Challenge",3,'choose'),
 ('M',7,"Dead Wrestlers Challenge",3,'choose'), ('M',8,"Wrestler Nicknames Challenge",3,'choose'),

 ('P',25,"The Tribal Chief",3,'left'), ('P',26,"That's Not Going To Work For Me, Brother",0,'left'),
 ('P',27,"Slow Count",5,'many'), ('P',28,"Faction",5,'others'),
 ('P',9,"You Are Cursed",0,'choose'), ('P',10,"You Are WWE Champion",0,'self'),
 ('P',11,"Title Match Penalty",0,'self'), ('P',12,"Pass The Penalty",0,'choose'),
]

CARDS += [
 # ---- contact sheet c08 ----
 ('M',21,"WWE & TNA Wrestlers Challenge",5,'choose'), ('M',22,"Wrestling Gimmicks Challenge",3,'many'),
 ('M',23,"Female Wrestlers Challenge",5,'choose'), ('M',24,"WWE & ECW Wrestlers Challenge",3,'choose'),
 ('M',381,"Money In The Bank Pt 2",0,'self'), ('M',382,"Jack Cartwheel",3,'self'),
 ('M',383,"Wrestlers Finisher",3,'right'), ('M',384,"The Wyatt Family",3,'choose'),

 ('M',295,"24/7 Champion",0,'self'), ('M',296,"Batista & John Cena Royal Rumble 2005 The Botch",3,'many'),
 ('M',297,"Survivor Series 2002 Promo",3,'all'), ('M',298,"Initials Battle",2,'choose'),
 ('M',413,"Suck It! DX",3,'right'), ('M',414,"DDP Yoga",3,'self'),
 ('M',415,"Wrestling Theme Song Artists",3,'choose'), ('M',416,"In Your House",5,'choose'),

 ('M',299,"Initials Battle",2,'choose'), ('M',300,"Initials Battle",2,'choose'),
 ('M',301,"Initials Battle",2,'choose'), ('M',302,"Initials Battle",2,'choose'),
 ('M',343,"Lie, Cheat, Steal Pt 3",0,'self'), ('M',344,"Spooky Match Challenge",2,'choose'),
 ('M',345,"Superhero Wrestler Challenge",2,'choose'), ('M',346,"Trouble In The Writers Room",3,'choose'),

 ('P',1,"Money In The Bank",0,'choose'), ('P',2,"Heel Turn",3,'choose'),
 ('P',3,"Tag Team",5,'many'), ('P',4,"Double Team",2,'many'),
 ('V',73,"Attacked After Match",2,'self'), ('V',74,"Moonsault",3,'self'),
 ('V',75,"Previous Match Appears Again",5,'self'), ('V',76,"Old Rivalry Mentioned",2,'self'),

 ('M',81,"Wrestling Betrayals",3,'choose'), ('M',82,"PPV Challenge",3,'choose'),
 ('M',83,"A-Z Tag Teams",3,'choose'), ('M',84,"Faction Leaders",3,'choose'),
 ('M',451,"Tag Teams With Women Valets / Managers",2,'choose'), ('M',452,"Tag Teams From The 80s / Early 90s",2,'many'),
 ('M',453,"The Hollys",3,'others'), ('M',454,"Tool Related Wrestlers",3,'right'),

 ('M',89,"Overrated",3,'choose'), ('M',90,"Underrated",3,'choose'),
 ('M',91,"Who Am I?",10,'many'), ('M',92,"Make The Connection",2,'many'),
 ('M',397,"The Four Horsemen",3,'many'), ('M',398,"The Four Horsewomen",3,'many'),
 ('M',399,"The Blue Meenie",3,'many'), ('M',400,"Wrestling Gimmick Jobs",3,'many'),

 # ---- contact sheet c09 ----
 ('M',61,"King / Queen Of The Ring Challenge",3,'choose'), ('M',62,"Wrestlers You'd Beat In A Fight",3,'choose'),
 ('M',63,"You Botched!",2,'self'), ('M',64,"You Screwed Yourself!",3,'self'),
 ('M',251,"Referee Bump",0,'self'), ('M',252,"Manager Distraction",0,'choose'),
 ('M',253,"Challenge Nation Of Domination",3,'choose'), ('M',254,"I Can Name European Champions",3,'choose'),

 ('M',231,"The Big Red Machine",2,'vote'), ('M',232,"Three Names",3,'choose'),
 ('M',233,"Hardcore Champs",3,'choose'), ('M',234,"Women's Champion",3,'choose'),
 ('M',435,"Doink Drink Ya Clown",3,'choose'), ('M',436,"No Contest",0,'self'),
 ('M',437,"Wrestlers With Pets",3,'choose'), ('M',438,"Back To OVW",3,'choose'),

 ('M',29,"Kayfabe Wrestling Relatives Challenge",5,'many'), ('M',30,"One On One With The Undertaker Playa",5,'choose'),
 ('M',31,"Supernatural Wrestling Characters Challenge",3,'choose'), ('M',32,"Wrestling Couples Challenge",5,'many'),
 ('M',339,"It's 420 Somewhere",3,'many'), ('M',340,"The Viper",4,'choose'),
 ('M',341,"My Name Is Finlay",3,'choose'), ('M',342,"Lie, Cheat, Steal Pt 2",0,'self'),

 ('M',211,"Your Mount Rushmore",3,'self'), ('M',212,"The Near Fall",3,'choose'),
 ('M',213,"Interference",0,'self'), ('M',214,"Heel Turn Interference",0,'self'),
 ('M',73,"Legend Killer",3,'choose'), ('M',74,"Animal Wrestlers Challenge",3,'self'),
 ('M',75,"A-Z Finishing Moves",5,'choose'), ('M',76,"A-Z Tag Teams / Factions",5,'choose'),

 ('M',275,"Judy Bagwell On A Buzzball Match",0,'choose'), ('M',276,"Judy Bagwell On A Buzzball Match",0,'choose'),
 ('M',277,"Rouse Thank You JCW",5,'choose'), ('M',278,"EC Dub EC Dub EC Dub",3,'all'),
 ('M',327,"Who Did They Take It From? Jeff Hardy",3,'choose'), ('M',328,"Who Did They Take It From? Edge",3,'choose'),
 ('M',329,"Who Did They Take It From? The Rock",3,'choose'), ('M',330,"Who Did They Take It From? Mark Henry",3,'choose'),

 ('M',33,"Bald Wrestlers Challenge",3,'choose'), ('M',34,"Asian Wrestling Superstars Challenge",5,'choose'),
 ('M',35,"Attitude Era Wrestlers Challenge",DOWN,'choose'), ('M',36,"Former Champions Challenge",5,'choose'),
]
