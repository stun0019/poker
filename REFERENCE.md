# ClubGG H5 prototype

Reference audit: 2026-09-16. ClubGG is the only product reference. The application is a single HTML file, with Canvas-rendered visible UI and accessible HTML controls. It is a web prototype, not a native application or an official ClubGG client.

## Sources

- Official product: https://www.clubgg.com/
- Official search / club / tournament registration walkthrough: https://www.clubgg.com/freeroll
- Official brand page: https://www.clubgg.com/media-guideline
- Official app listing and embedded app icon: https://play.google.com/store/apps/details?id=com.nsus.clubgg
- Supplemental screenshots of lobby, club, table, menu and settings: https://www.bsbpokerclubgg.com/how-does-the-clubgg-app-work (independent guide; screenshots may represent an older release).

The public app icon is embedded in index.html. No proprietary ClubGG application source, full icon pack, sound pack or private assets were obtained. Other graphics are reconstructed Canvas elements / fixture club artwork; sounds are synthesized locally. This is NOT a verified pixel-for-pixel reproduction of all twenty screens. Management, creation forms and secondary screens need matching-version screenshots to verify exact placement and behavior. No Natural8 assets or navigation are used.

## Implemented local flows

- A: Main Lobby / My Clubs → Club Lobby → cash table list → table detail → buy-in → poker table.
- B: Club → tournament list → tournament detail → register / unregister → poker table.
- C: Club → Create Game → cash settings → Create → saved table in that club.
- D: Club → Create Tournament → tournament settings → Create → saved tournament in that club.
- Search / Join Club, Create Club, Members, owner management, player profile, hand history, statistics and settings have local state and navigation.
- The seeded My Poker Club grants local owner access for testing creation and management.
- Main-lobby membership/event/stage/casino navigation remains reference context only; those products are outside the requested twenty-screen implementation.

## Table and state

The existing independently testable Hold'em engine is retained: legal actions, side pots, all-ins, showdown, AI opponents and local hand history. Table controls include preset raises, numeric input, hold-to-raise with downward cancellation, card-peek interaction, a table menu and local synthesized sound. Buy-in / top-up / cash-out use each club's virtual balance. An interrupted hand restores its last safe start balance once on refresh; this is prototype recovery, not server settlement.

Only six-seat NLH is simulated. PLO / short-deck filters do not fabricate functioning game engines. Tournaments use one local six-player elimination table, blind levels and fixture prizes; there is no real multi-table tournament service, table balancing, matchmaking, identity, payment or network opponent. Registration fees and rewards are virtual local data.

Data is stored in localStorage under clubgg-h5-prototype-v1, with existing table preferences and hand-history storage retained. Clearing browser data resets the demo. No account or real ClubGG club is contacted. Some platform-dependent settings, including vibration, cannot be guaranteed across browsers.

## Verification

Automated browser checks cover flows A–D, persistence, joining/creating clubs, member roles, settings, mobile layout, raise cancellation, keypad bounds, settings-to-table resume, hand settlement, club statistics/history, cash-out and one-time refresh recovery. Engine checks cover hand ranking, blinds, all-ins, side pots and 1,200 seeded chip-conservation scenarios. These checks validate prototype behavior, not parity with an authenticated current ClubGG release.

Open index.html directly, or serve this folder with a local HTTP server. No build step or server backend is required. Nothing was committed or pushed by the assistant.
