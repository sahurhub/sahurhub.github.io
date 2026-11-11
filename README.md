# SahurHub

A hub for my games, live at **https://sahurhub.github.io/**.

## Adding or changing a game

Open `games.js` and edit the list. Each game is one `{ ... }` block. The comment at the top of the file explains every field. To make a game playable, put its address in `url`. That can be a folder in this repository, for example `games/sky-runner/`, or a full web address.

Save the file to the `main` branch. The site updates by itself after about a minute.

## Changing the school times

Open `countdown.js`. The `SCHOOL_DAY` list at the top has one line per period, with 24-hour start and end times. Gaps between periods count as passing time automatically. `SCHOOL_DAYS` underneath says which days have school (1 = Monday to 5 = Friday).

## Files

| File | What it is |
|---|---|
| `index.html` | The page layout |
| `styles.css` | Colors, sizes, fonts and animations (light and dark colors are at the top) |
| `app.js` | Search, filters, favorites, recently played, the tab bar lens and the glass effect |
| `games.js` | The list of games (the only file you normally edit) |
| `countdown.js` | The "next up" school countdown. The school times are the list at the very top of this file |
| `desktop.js`, `desktop.css` | Desktop Mode: the Mac-style desktop with the magnifying Dock. Only loaded when someone opens it |
| `favicon.svg` | The little icon in the browser tab |

Favorites, recently played and Desktop Mode settings are saved in each visitor's own browser, so there are no accounts.

## Credits

- Liquid glass effect: [LiquidGlass](https://liquid-glass.ybouane.com/) by @ybouane (MIT license), loaded from jsDelivr.
- Font: [Inter](https://rsms.me/inter/) (SIL Open Font License), loaded from jsDelivr.
