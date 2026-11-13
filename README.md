# SahurHub

A hub for my games, live at **https://sahurhub.github.io/**.

## Adding or changing a game

Open `games.js` and edit the list. Each game is one `{ ... }` block. The comment at the top of the file explains every field. To make a game playable, put its address in `url`. That can be a folder in this repository, for example `games/sky-runner/`, or a full web address.

Save the file to the `main` branch. The site updates by itself after about a minute.

## Changing the school times

Open `countdown.js`. The `SCHOOL_DAY` list at the top has one line per period, with 24-hour start and end times. Gaps between periods count as passing time automatically. `SCHOOL_DAYS` underneath says which days have school (1 = Monday to 5 = Friday).

## SahurHub Chat

The Chat button opens a Discord-style chat. The window is `chat.js` and `chat.css`, which the live site loads from the chat server (`~/sahurhub-chat/client`), so the chat can be updated without republishing this site. The copies in this folder are used by the local preview. The chat server runs on the Oracle server in `~/sahurhub-chat` as the user service `sahurhub-chat`, behind Caddy at https://chat-79-72-86-205.nip.io. A copy of the server code is kept on the PC in the `sahurhub-chat-server` folder.

Owner commands, run on the server in `~/sahurhub-chat`:

- `./chat-admin users` lists every account
- `./chat-admin make-owner NAME` gives someone the Owner role
- `./chat-admin reset-password NAME` makes a new temporary password

Messages are deleted after 90 days. The database is copied to `~/sahurhub-chat/backups` every night (7 copies kept). The bad-word list is at the top of `lib/filter.js` on the server.

## Files

| File | What it is |
|---|---|
| `index.html` | The page layout |
| `styles.css` | Colors, sizes, fonts and animations (light and dark colors are at the top) |
| `app.js` | Search, filters, favorites, recently played, the tab bar lens and the glass effect |
| `games.js` | The list of games (the only file you normally edit) |
| `countdown.js` | The "next up" school countdown. The school times are the list at the very top of this file |
| `chat.js`, `chat.css` | SahurHub Chat: the chat window (the live copies are on the chat server, see above) |
| `desktop.js`, `desktop.css` | Desktop Mode: the Mac-style desktop with the magnifying Dock. Only loaded when someone opens it |
| `favicon.svg` | The little icon in the browser tab |

Favorites, recently played and Desktop Mode settings are saved in each visitor's own browser, so there are no accounts.

## Credits

- Liquid glass effect: [LiquidGlass](https://liquid-glass.ybouane.com/) by @ybouane (MIT license), loaded from jsDelivr.
- Font: [Inter](https://rsms.me/inter/) (SIL Open Font License), loaded from jsDelivr.
