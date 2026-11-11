# SahurHub

A hub for my games, live at **https://sahurhub.github.io/**.

## Adding or changing a game

Open `games.js` and edit the list. Each game is one `{ ... }` block. The comment at the top of the file explains every field. To make a game playable, put its address in `url`. That can be a folder in this repository, for example `games/sky-runner/`, or a full web address.

Save the file to the `main` branch. The site updates by itself after about a minute.

## Files

| File | What it is |
|---|---|
| `index.html` | The page layout |
| `styles.css` | Colors, sizes, fonts and animations (light and dark colors are at the top) |
| `app.js` | Search, filters, favorites, recently played, the tab bar lens and the glass effect |
| `games.js` | The list of games (the only file you normally edit) |
| `desktop.js`, `desktop.css` | Desktop Mode: the Mac-style desktop with the magnifying Dock. Only loaded when someone opens it |
| `favicon.svg` | The little icon in the browser tab |

Favorites, recently played and Desktop Mode settings are saved in each visitor's own browser, so there are no accounts.

## Credits

- Liquid glass effect: [LiquidGlass](https://liquid-glass.ybouane.com/) by @ybouane (MIT license), loaded from jsDelivr.
- Font: [Inter](https://rsms.me/inter/) (SIL Open Font License), loaded from jsDelivr.
