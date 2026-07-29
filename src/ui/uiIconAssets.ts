import type { WeatherId } from '../game/types';

interface UiIconFrame {
  atlas: string;
  column: number;
  row: number;
}

const STATUS_ATLAS = '/assets/ui/status-weather-icons-v1.png';
const ACTION_ATLAS = '/assets/ui/action-symbol-icons-v1.png';
const SPECIAL_ATLAS = '/assets/ui/special-icons-v1.png';
const COURT_ITEM_ATLAS = '/assets/ui/court-item-icons-v1.png';

export const UI_ICON_FRAMES = {
  weatherClear: { atlas: STATUS_ATLAS, column: 0, row: 0 },
  weatherRain: { atlas: STATUS_ATLAS, column: 1, row: 0 },
  weatherFrost: { atlas: STATUS_ATLAS, column: 2, row: 0 },
  weatherHeavySnow: { atlas: STATUS_ATLAS, column: 3, row: 0 },
  weatherBlizzard: { atlas: STATUS_ATLAS, column: 0, row: 1 },
  weatherColdSnap: { atlas: STATUS_ATLAS, column: 1, row: 1 },
  weatherThawFlood: { atlas: STATUS_ATLAS, column: 2, row: 1 },
  menu: { atlas: STATUS_ATLAS, column: 3, row: 1 },
  buildHousing: { atlas: STATUS_ATLAS, column: 0, row: 2 },
  buildProduction: { atlas: STATUS_ATLAS, column: 1, row: 2 },
  buildFarming: { atlas: STATUS_ATLAS, column: 2, row: 2 },
  buildDefense: { atlas: STATUS_ATLAS, column: 3, row: 2 },
  buildSpecial: { atlas: STATUS_ATLAS, column: 0, row: 3 },
  lock: { atlas: STATUS_ATLAS, column: 1, row: 3 },
  literate: { atlas: STATUS_ATLAS, column: 2, row: 3 },
  sick: { atlas: STATUS_ATLAS, column: 3, row: 3 },

  cart: { atlas: ACTION_ATLAS, column: 0, row: 0 },
  horse: { atlas: ACTION_ATLAS, column: 1, row: 0 },
  habitat: { atlas: ACTION_ATLAS, column: 2, row: 0 },
  petition: { atlas: ACTION_ATLAS, column: 3, row: 0 },
  arsenal: { atlas: ACTION_ATLAS, column: 0, row: 1 },
  hostile: { atlas: ACTION_ATLAS, column: 1, row: 1 },
  friendly: { atlas: ACTION_ATLAS, column: 2, row: 1 },
  important: { atlas: ACTION_ATLAS, column: 3, row: 1 },
  disabled: { atlas: ACTION_ATLAS, column: 0, row: 2 },
  success: { atlas: ACTION_ATLAS, column: 1, row: 2 },
  raid: { atlas: ACTION_ATLAS, column: 2, row: 2 },
  warning: { atlas: ACTION_ATLAS, column: 3, row: 2 },
  mounted: { atlas: ACTION_ATLAS, column: 0, row: 3 },
  eagle: { atlas: ACTION_ATLAS, column: 1, row: 3 },
  nitre: { atlas: ACTION_ATLAS, column: 2, row: 3 },
  decree: { atlas: ACTION_ATLAS, column: 3, row: 3 },

  shaman: { atlas: SPECIAL_ATLAS, column: 0, row: 0 },
  monk: { atlas: SPECIAL_ATLAS, column: 1, row: 0 },
  scholar: { atlas: SPECIAL_ATLAS, column: 2, row: 0 },
  fireworks: { atlas: SPECIAL_ATLAS, column: 3, row: 0 },
  tiger: { atlas: SPECIAL_ATLAS, column: 0, row: 1 },
  geomancer: { atlas: SPECIAL_ATLAS, column: 1, row: 1 },
  herb: { atlas: SPECIAL_ATLAS, column: 2, row: 1 },
  smith: { atlas: SPECIAL_ATLAS, column: 3, row: 1 },
  interpreter: { atlas: SPECIAL_ATLAS, column: 0, row: 2 },
  cannon: { atlas: SPECIAL_ATLAS, column: 1, row: 2 },
  calligraphy: { atlas: SPECIAL_ATLAS, column: 2, row: 2 },
  moon: { atlas: SPECIAL_ATLAS, column: 3, row: 2 },
  trident: { atlas: SPECIAL_ATLAS, column: 0, row: 3 },
  tracking: { atlas: SPECIAL_ATLAS, column: 1, row: 3 },
  target: { atlas: SPECIAL_ATLAS, column: 2, row: 3 },
  needle: { atlas: SPECIAL_ATLAS, column: 3, row: 3 },

  grantReliefVoucher: { atlas: COURT_ITEM_ATLAS, column: 2, row: 0 },
  grantWaiverDecree: { atlas: COURT_ITEM_ATLAS, column: 3, row: 0 },
  grantRecruitmentNotice: { atlas: COURT_ITEM_ATLAS, column: 0, row: 1 },
  grantRainGauge: { atlas: COURT_ITEM_ATLAS, column: 1, row: 1 },
  grantAgriculturalEdict: { atlas: COURT_ITEM_ATLAS, column: 2, row: 1 },
  grantMedicalBook: { atlas: COURT_ITEM_ATLAS, column: 3, row: 1 },
  grantMilitaryTreatise: { atlas: COURT_ITEM_ATLAS, column: 0, row: 2 },
  grantTelescope: { atlas: COURT_ITEM_ATLAS, column: 1, row: 2 },
  grantRoyalPlaque: { atlas: COURT_ITEM_ATLAS, column: 2, row: 2 },
  grantJijaChongtong: { atlas: COURT_ITEM_ATLAS, column: 3, row: 2 },
  grantRoyalSpear: { atlas: COURT_ITEM_ATLAS, column: 0, row: 3 },
  grantRoyalHornBow: { atlas: COURT_ITEM_ATLAS, column: 1, row: 3 },
  grantRoyalMusket: { atlas: COURT_ITEM_ATLAS, column: 2, row: 3 },
} as const satisfies Record<string, UiIconFrame>;

export type UiIconName = keyof typeof UI_ICON_FRAMES;

export const WEATHER_UI_ICON_NAMES: Record<WeatherId, UiIconName> = {
  clear: 'weatherClear',
  rain: 'weatherRain',
  frost: 'weatherFrost',
  heavySnow: 'weatherHeavySnow',
  blizzard: 'weatherBlizzard',
  coldSnap: 'weatherColdSnap',
  thawFlood: 'weatherThawFlood',
};
