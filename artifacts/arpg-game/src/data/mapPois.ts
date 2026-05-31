/**
 * mapPois — registry of world-map points of interest (industries / structures).
 *
 * Each entry maps a survival-MMO POI id to a 64×64 PNG icon under
 * `/icons/map/`. Icons were converted from Farming Simulator 22 mapUS DDS
 * source via `scripts/convert-map-icons.mjs`.
 *
 * The data here is purely descriptive — consumed by:
 *   • MiniMap.tsx (renders an <img> when MapMarker.iconUrl is set)
 *   • Future WorldGen POI placer (each settlement / industry node attaches a
 *     poiType so the markers list is built off this table)
 *
 * No runtime spawn logic is implied by this file. Adding a POI to the world
 * means writing a marker row that points at one of these `iconUrl` strings.
 */
export type MapPoiType =
  | 'fuelDepot'
  | 'oreMine'
  | 'lumberCamp'
  | 'livestockTrader'
  | 'scrapyard'
  | 'railhead'
  | 'weighPost'
  | 'smelter'
  | 'granary'
  | 'riverGranary'
  | 'railSilo'
  | 'trashPile'
  | 'shackForSale'
  | 'cementFactory'
  | 'powerPlant'
  | 'fertilizerBuyer'
  | 'fertilizerBuyerLiquid'
  | 'vehicleDealer';

export interface MapPoiDef {
  id: MapPoiType;
  label: string;
  description: string;
  iconUrl: string;
  /** Suggested minimap kind bucket for tooltip colouring. */
  category: 'industry' | 'trade' | 'transport' | 'shelter' | 'scrap';
}

const ICON = (n: string) => `/icons/map/${n}.png`;

export const MAP_POI_DEFS: Record<MapPoiType, MapPoiDef> = {
  fuelDepot: {
    id: 'fuelDepot', category: 'industry', iconUrl: ICON('fuelDepot'),
    label: 'Fuel Depot',
    description: 'Refuel station. Trade scavenged fuel cans for credits.',
  },
  oreMine: {
    id: 'oreMine', category: 'industry', iconUrl: ICON('oreMine'),
    label: 'Ore Mine',
    description: 'Iron-rich deposit. Pickaxe required; spawns ore veins.',
  },
  lumberCamp: {
    id: 'lumberCamp', category: 'industry', iconUrl: ICON('lumberCamp'),
    label: 'Lumber Camp',
    description: 'Sawmill node. Bring logs, leave with planks.',
  },
  livestockTrader: {
    id: 'livestockTrader', category: 'trade', iconUrl: ICON('livestockTrader'),
    label: 'Livestock Trader',
    description: 'Buys/sells farm animals: cows, pigs, sheep, horses.',
  },
  scrapyard: {
    id: 'scrapyard', category: 'scrap', iconUrl: ICON('scrapyard'),
    label: 'Scrapyard',
    description: 'Picks-pile loot node. Common scrap, rare salvage.',
  },
  railhead: {
    id: 'railhead', category: 'transport', iconUrl: ICON('railhead'),
    label: 'Railhead',
    description: 'Fast-travel point between settlements.',
  },
  weighPost: {
    id: 'weighPost', category: 'trade', iconUrl: ICON('weighPost'),
    label: 'Weigh Post',
    description: 'Bulk-good buyer. Sells caravan contracts.',
  },
  smelter: {
    id: 'smelter', category: 'industry', iconUrl: ICON('smelter'),
    label: 'Smelter',
    description: 'Refine ore into ingots. Coal-fed industrial node.',
  },
  granary: {
    id: 'granary', category: 'industry', iconUrl: ICON('granary'),
    label: 'Granary',
    description: 'Bulk grain storage. Feed buyer for livestock kits.',
  },
  riverGranary: {
    id: 'riverGranary', category: 'industry', iconUrl: ICON('riverGranary'),
    label: 'River Granary',
    description: 'Waterborne grain depot. Higher prices for fresh stock.',
  },
  railSilo: {
    id: 'railSilo', category: 'transport', iconUrl: ICON('railSilo'),
    label: 'Rail Silo',
    description: 'Bulk loading point along the rail line.',
  },
  trashPile: {
    id: 'trashPile', category: 'scrap', iconUrl: ICON('trashPile'),
    label: 'Trash Pile',
    description: 'Low-tier loot node. Cloth, plastic, occasional tool.',
  },
  shackForSale: {
    id: 'shackForSale', category: 'shelter', iconUrl: ICON('shackForSale'),
    label: 'Shack For Sale',
    description: 'Buyable starter shelter. Modest crafting bench inside.',
  },
  cementFactory: {
    id: 'cementFactory', category: 'industry', iconUrl: ICON('cementFactory'),
    label: 'Cement Plant',
    description: 'Concrete supplier. Required for tier-3 foundations.',
  },
  powerPlant: {
    id: 'powerPlant', category: 'industry', iconUrl: ICON('powerPlant'),
    label: 'Power Plant',
    description: 'Biogas station. Sells generators + fuel cells.',
  },
  fertilizerBuyer: {
    id: 'fertilizerBuyer', category: 'trade', iconUrl: ICON('fertilizerBuyer'),
    label: 'Fertilizer Buyer',
    description: 'Manure buyer. Quietly the most lucrative livestock byproduct.',
  },
  fertilizerBuyerLiquid: {
    id: 'fertilizerBuyerLiquid', category: 'trade', iconUrl: ICON('fertilizerBuyerLiquid'),
    label: 'Liquid Fertilizer Buyer',
    description: 'Premium fertilizer buyer; requires barreled stock.',
  },
  vehicleDealer: {
    id: 'vehicleDealer', category: 'trade', iconUrl: ICON('vehicleDealer'),
    label: 'Vehicle Dealer',
    description: 'Sells trucks, carts, and salvaged frames.',
  },
};

export const MAP_POI_LIST: MapPoiDef[] = Object.values(MAP_POI_DEFS);

export function getMapPoi(type: MapPoiType): MapPoiDef {
  return MAP_POI_DEFS[type];
}
