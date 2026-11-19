// UK Simulator - the texture set (all from ambientCG.com, CC0) and their layer numbers.
// tools/pack-textures.html turns the downloads in cache/textures/ into client/textures/<key>_c.jpg
// (colour) and <key>_n.jpg (normal X/Y in red/green, roughness in blue), 512 x 512.
// `size` = metres one texture repeat covers in the world.
export const TEXTURES = [
  // ground
  { key: 'asphalt', src: 'Road012A', size: 3.5 },
  { key: 'paving', src: 'PavingStones128', size: 2.4 },
  { key: 'lawn', src: 'Grass004', size: 3 },
  { key: 'meadow', src: 'Grass003', size: 4 },
  { key: 'rough', src: 'Ground037', size: 4 },
  { key: 'soil', src: 'Ground103', size: 3 },
  { key: 'mud', src: 'Ground109', size: 3 },
  { key: 'sand', src: 'Ground080', size: 3 },
  { key: 'forest', src: 'Ground106', size: 3 },
  { key: 'gravel', src: 'Gravel041', size: 2 },
  { key: 'concrete', src: 'Concrete031', size: 4 },
  { key: 'asphalt2', src: 'Asphalt033', size: 3 },
  // walls
  { key: 'redbrick', src: 'Bricks051', size: 1.6 },
  { key: 'buffbrick', src: 'Bricks053', size: 1.6 },
  { key: 'oldbrick', src: 'Bricks041', size: 1.8 },
  { key: 'render', src: 'Plaster001', size: 2.5 },
  { key: 'pebbledash', src: 'Concrete034', size: 1.5 },
  { key: 'stone', src: 'Bricks089', size: 2.2 },
  { key: 'cladding', src: 'CorrugatedSteel005', size: 2 },
  { key: 'timber', src: 'Planks037A', size: 2 },
  { key: 'concretewall', src: 'Concrete042A', size: 3 },
  // roofs
  { key: 'clay', src: 'RoofingTiles014A', size: 2 },
  { key: 'slate', src: 'RoofingTiles003', size: 2 },
  { key: 'rooftile', src: 'RoofingTiles013A', size: 2 },
];
export const LAYER = Object.fromEntries(TEXTURES.map((t, i) => [t.key, i]));
export const TEX_SIZE = 512;
