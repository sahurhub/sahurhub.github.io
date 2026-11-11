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
    newTab      true to open the game in a new browser tab instead of the same one
    featured    true for the game shown in the big banner at the top (pick one)
    isNew       true to show a "NEW" badge

  Everything below is a placeholder. Replace it with your real games.
*/
window.SAHURHUB_GAMES = [
  {
    id: "sky-runner",
    title: "Sky Runner",
    category: "Arcade",
    tags: ["runner", "endless", "jump", "one tap"],
    description: "Placeholder game. Dash across floating islands and see how far you can get before you fall.",
    icon: "rocket",
    colors: ["#5ac8fa", "#3a5bff"],
    url: "",
    featured: true
  },
  {
    id: "neon-drift",
    title: "Neon Drift",
    category: "Racing",
    tags: ["cars", "drift", "speed", "night"],
    description: "Placeholder game. Slide through glowing city streets and chain drifts for a high score.",
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
    description: "Placeholder game. Fit falling blocks together and clear the board.",
    icon: "cube",
    colors: ["#ff9f0a", "#ff375f"],
    url: ""
  },
  {
    id: "pixel-quest",
    title: "Pixel Quest",
    category: "Action",
    tags: ["adventure", "retro", "rpg", "sword"],
    description: "Placeholder game. A small retro adventure with dungeons, loot and a big final boss.",
    icon: "sword",
    colors: ["#30d158", "#0a84ff"],
    url: ""
  },
  {
    id: "tower-stack",
    title: "Tower Stack",
    category: "Arcade",
    tags: ["stacking", "timing", "one tap"],
    description: "Placeholder game. Drop each floor at the perfect moment and build the tallest tower.",
    icon: "castle",
    colors: ["#ffd60a", "#ff9f0a"],
    url: ""
  },
  {
    id: "star-hopper",
    title: "Star Hopper",
    category: "Action",
    tags: ["space", "platformer", "stars"],
    description: "Placeholder game. Jump from planet to planet and collect every star.",
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
    description: "Placeholder game. Find the way out of mazes that get trickier every level.",
    icon: "target",
    colors: ["#64d2ff", "#30d158"],
    url: ""
  },
  {
    id: "turbo-kart",
    title: "Turbo Kart",
    category: "Racing",
    tags: ["karts", "boost", "multiplayer"],
    description: "Placeholder game. Short, chaotic kart races with boosts on every corner.",
    icon: "bolt",
    colors: ["#ff453a", "#ff9f0a"],
    url: ""
  },
  {
    id: "bubble-pop",
    title: "Bubble Pop",
    category: "Puzzle",
    tags: ["match", "casual", "colors"],
    description: "Placeholder game. Match three bubbles of the same color to pop them.",
    icon: "bubbles",
    colors: ["#ff6482", "#ffb340"],
    url: ""
  },
  {
    id: "castle-siege",
    title: "Castle Siege",
    category: "Strategy",
    tags: ["tower defense", "castles", "waves"],
    description: "Placeholder game. Build defenses and hold your castle against wave after wave.",
    icon: "crown",
    colors: ["#8e8e93", "#5e5ce6"],
    url: ""
  },
  {
    id: "space-miner",
    title: "Space Miner",
    category: "Strategy",
    tags: ["idle", "mining", "space", "upgrades"],
    description: "Placeholder game. Mine asteroids, upgrade your ship and expand your space station.",
    icon: "gem",
    colors: ["#00c7be", "#5856d6"],
    url: ""
  },
  {
    id: "arena-clash",
    title: "Arena Clash",
    category: "Multiplayer",
    tags: ["pvp", "online", "friends"],
    description: "Placeholder game. Quick online battles against friends.",
    icon: "controller",
    colors: ["#bf5af2", "#ff375f"],
    url: ""
  }
];
