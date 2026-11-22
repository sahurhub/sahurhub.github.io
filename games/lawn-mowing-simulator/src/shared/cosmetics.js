// Cosmetics: mower colours, hats, outfits and pets (shared by the game and the server).

export const PAINTS = {
  red: { name: 'Classic Red', color: '#e8322e', price: 0 },
  green: { name: 'Lawn Green', color: '#2fb24c', price: 150 },
  yellow: { name: 'Sunny Yellow', color: '#ffc928', price: 150 },
  blue: { name: 'Sky Blue', color: '#2f80ed', price: 200 },
  orange: { name: 'Pumpkin Orange', color: '#ff8a1f', price: 200 },
  black: { name: 'Midnight', color: '#30333b', price: 300 },
  pink: { name: 'Bubblegum', color: '#ff6fae', price: 300 },
  purple: { name: 'Grape', color: '#8c52e8', price: 350 },
  white: { name: 'Snow White', color: '#f2f4f7', price: 400 },
  gold: { name: 'Gold Rush', color: '#e2b23a', price: 2500 },
};

export const HATS = {
  none: { name: 'No hat', model: null, price: 0 },
  cap: { name: 'Red Cap', model: 'hat_cap', price: 100 },
  bucket: { name: 'Bucket Hat', model: 'hat_bucket', price: 150 },
  straw: { name: 'Straw Hat', model: 'hat_straw', price: 200 },
  beanie: { name: 'Beanie', model: 'hat_beanie', price: 250 },
  hard: { name: 'Hard Hat', model: 'hat_hard', price: 300 },
  cowboy: { name: 'Cowboy Hat', model: 'hat_cowboy', price: 500 },
  party: { name: 'Party Hat', model: 'hat_party', price: 600 },
  top: { name: 'Top Hat', model: 'hat_top', price: 900 },
  viking: { name: 'Viking Helmet', model: 'hat_viking', price: 1500 },
  crown: { name: 'Crown', model: 'hat_crown', price: 5000 },
};

export const OUTFITS = {
  casual: { name: 'Casual Blue', shirt: '#2f80ed', pants: '#2b2d36', price: 0 },
  gardener: { name: 'Gardener', shirt: '#3fa34d', pants: '#6b4a2f', price: 150 },
  hivis: { name: 'Hi-Vis', shirt: '#ffd23f', pants: '#27355c', price: 250 },
  summer: { name: 'Summer', shirt: '#ff7eb6', pants: '#f4f1e8', price: 250 },
  lumber: { name: 'Lumberjack', shirt: '#c4473a', pants: '#27355c', price: 350 },
  pro: { name: 'Lawn Pro', shirt: '#1fb5a5', pants: '#2b2d36', price: 500 },
  royal: { name: 'Royal', shirt: '#8c52e8', pants: '#e2b23a', price: 1200 },
  night: { name: 'All Black', shirt: '#30333b', pants: '#1c1d22', price: 800 },
};

export const PETS = {
  none: { name: 'No pet', model: null, price: 0 },
  duck: { name: 'Duckling', model: 'pet_duck', price: 300 },
  frog: { name: 'Froggy', model: 'pet_frog', price: 450 },
  bunny: { name: 'Bunny', model: 'pet_bunny', price: 700 },
  hedgehog: { name: 'Hedgehog', model: 'pet_hedgehog', price: 900 },
  cat: { name: 'Ginger Cat', model: 'pet_cat', price: 1400 },
  dog: { name: 'Good Dog', model: 'pet_dog', price: 2200 },
};

export const COSMETIC_KINDS = { paint: PAINTS, hat: HATS, outfit: OUTFITS, pet: PETS };
