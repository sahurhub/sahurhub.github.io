/*
  SahurHub game list
  ==================
  This is the only file you need to edit to add, change or remove games.

  Each game is one { ... } block. Fields:
    id          short unique name, lowercase, no spaces (used to remember favorites)
    title       the name shown on the site
    category    one word or short phrase; category filter chips are made from these
    tags        extra words people might search for
    description a sentence or two about the game
    icon        picture on the card: rocket, car, cube, sword, castle, star,
                target, bolt, bubbles, crown, gem, controller
    colors      two colors for the card background (start and end of the gradient)
    url         where the Play button goes. Leave it as "" while the game is not ready
                (the site then says "coming soon"). Can be a folder in this repository,
                for example "games/sky-runner/", or a full web address.
                Each visitor picks how games open in a game's details: about:blank
                (the default), on SahurHub (play.html), or a new tab.
    newTabOnly  true for a game whose site refuses to be shown inside another page;
                it then always opens in a normal new tab.
    cover       optional cover picture, for example "covers/snowball-rush.jpg" (a file
                in the covers folder of this repository). Use a landscape 16:9 picture,
                1920 x 1080 or at least 1280 x 720, with the main thing in the middle:
                small spots (like the Recently Played row) only show the middle square.
                Without a cover the card shows the icon and colors instead.
    featured    true for the game shown in the big banner at the top (pick one)
    isNew       true to show a "NEW" badge

  Everything below is a placeholder. Replace it with your real games.
*/
window.SAHURHUB_GAMES = [
  {
    // The game's files are in games/f1-simulator/ in this repository.
    id: "f1-simulator",
    title: "F1 Simulator",
    category: "Racing",
    tags: ["f1", "formula 1", "cars", "monza", "3d", "simulator", "racing"],
    description: "Race the 2026 Formula 1 cars around Monza in 3D. Keyboard or controller.",
    icon: "car",
    colors: ["#e10600", "#1e1e2a"],
    url: "games/f1-simulator/",
    cover: "covers/f1-simulator.jpg",
    featured: true,
    isNew: true
  },
  {
    // Runs on Google Apps Script; it allows being shown inside other pages.
    id: "snowball-rush",
    title: "Snowball Rush",
    category: "Simulator",
    tags: ["snow", "snowball", "simulator", "race", "pets", "upgrades", "3d", "winter"],
    description: "Train your snowball, race it down the hill and hatch pets. Unlock the Spooky and Candy worlds.",
    icon: "bubbles",
    colors: ["#7fd8ff", "#2f6bff"],
    url: "https://script.google.com/macros/s/AKfycbx6X9zeQagijDw4FZseqyrK8oMfDFWXzqFlO9WmKt4LOByaZ2ZxRH6igxqgcSet7KQe/exec",
    cover: "covers/snowball-rush.jpg",
    isNew: true
  },
  {
    // A Unity game hosted on jsDelivr (with Playgama ads); it allows being shown
    // inside other pages.
    id: "military-strike",
    title: "Military Strike",
    category: "Action",
    tags: ["military", "shooter", "fps", "guns", "army", "war", "sniper", "3d"],
    description: "A 3D first-person shooter. Pick your loadout, earn XP and unlock new guns like snipers and machine guns.",
    icon: "target",
    colors: ["#6b7a3a", "#252a17"],
    url: "https://cdn.jsdelivr.net/gh/maureenbev/service@c3ee9113a0cc37adb1e8e329fed4398ecb285142/lib/ms.svg",
    cover: "covers/military-strike.jpg",
    isNew: true
  },
  {
    // A Unity game on Google Apps Script (files from jsDelivr); it allows being
    // shown inside other pages.
    id: "dune-dash",
    title: "Dune Dash",
    category: "Arcade",
    tags: ["dunes", "desert", "ball", "one tap", "jump", "endless", "skins"],
    description: "Hold to speed down the dunes, let go to fly and hold again to dive. Unlock skins and beat challenges.",
    icon: "bolt",
    colors: ["#ffcf6e", "#1fb5bf"],
    url: "https://script.google.com/macros/s/AKfycbxif2sgdRNG-zqSFKUNZ60ZABnsdBYug037DeKlnuXY1XYyveJlFQK6YHpCX-KiWnC6/exec",
    cover: "covers/dune-dash.jpg",
    isNew: true
  },
  {
    id: "sky-runner",
    title: "Sky Runner",
    category: "Arcade",
    tags: ["runner", "endless", "jump", "one tap"],
    description: "Placeholder opsec. Dash across floating islands and see how far you can get before you fall.",
    icon: "rocket",
    colors: ["#5ac8fa", "#3a5bff"],
    url: ""
  },
  {
    id: "neon-drift",
    title: "Neon Drift",
    category: "Racing",
    tags: ["cars", "drift", "speed", "night"],
    description: "Placeholder opsec. Slide through glowing city streets and chain drifts for a high score.",
    icon: "car",
    colors: ["#ff2d55", "#8e3cff"],
    url: "",
    isNew: true
  },
  {
    id: "block-builder",
    title: "Block Builder",
    category: "Puzzle",
    tags: ["blocks", "building", "relaxing"],
    description: "Placeholder opsec. Fit falling blocks together and clear the board.",
    icon: "cube",
    colors: ["#ff9f0a", "#ff375f"],
    url: ""
  },
  {
    id: "pixel-quest",
    title: "Pixel Quest",
    category: "Action",
    tags: ["adventure", "retro", "rpg", "sword"],
    description: "Placeholder opsec. A small retro adventure with dungeons, loot and a big final boss.",
    icon: "sword",
    colors: ["#30d158", "#0a84ff"],
    url: ""
  },
  {
    id: "tower-stack",
    title: "Tower Stack",
    category: "Arcade",
    tags: ["stacking", "timing", "one tap"],
    description: "Placeholder opsec. Drop each floor at the perfect moment and build the tallest tower.",
    icon: "castle",
    colors: ["#ffd60a", "#ff9f0a"],
    url: ""
  },
  {
    id: "star-hopper",
    title: "Star Hopper",
    category: "Action",
    tags: ["space", "platformer", "stars"],
    description: "Placeholder opsec. Jump from planet to planet and collect every star.",
    icon: "star",
    colors: ["#5e5ce6", "#bf5af2"],
    url: "",
    isNew: true
  },
  {
    id: "maze-master",
    title: "Maze Master",
    category: "Puzzle",
    tags: ["maze", "brain", "logic"],
    description: "Placeholder opsec. Find the way out of mazes that get trickier every level.",
    icon: "target",
    colors: ["#64d2ff", "#30d158"],
    url: ""
  },
  {
    id: "turbo-kart",
    title: "Turbo Kart",
    category: "Racing",
    tags: ["karts", "boost", "multiplayer"],
    description: "Placeholder opsec. Short, chaotic kart races with boosts on every corner.",
    icon: "bolt",
    colors: ["#ff453a", "#ff9f0a"],
    url: ""
  },
  {
    id: "bubble-pop",
    title: "Bubble Pop",
    category: "Puzzle",
    tags: ["match", "casual", "colors"],
    description: "Placeholder opsec. Match three bubbles of the same color to pop them.",
    icon: "bubbles",
    colors: ["#ff6482", "#ffb340"],
    url: ""
  },
  {
    id: "castle-siege",
    title: "Castle Siege",
    category: "Strategy",
    tags: ["tower defense", "castles", "waves"],
    description: "Placeholder opsec. Build defenses and hold your castle against wave after wave.",
    icon: "crown",
    colors: ["#8e8e93", "#5e5ce6"],
    url: ""
  },
  {
    id: "space-miner",
    title: "Space Miner",
    category: "Strategy",
    tags: ["idle", "mining", "space", "upgrades"],
    description: "Placeholder opsec. Mine asteroids, upgrade your ship and expand your space station.",
    icon: "gem",
    colors: ["#00c7be", "#5856d6"],
    url: ""
  },
  {
    id: "arena-clash",
    title: "Arena Clash",
    category: "Multiplayer",
    tags: ["pvp", "online", "friends"],
    description: "Placeholder opsec. Quick online battles against friends.",
    icon: "controller",
    colors: ["#bf5af2", "#ff375f"],
    url: ""
  }
];
