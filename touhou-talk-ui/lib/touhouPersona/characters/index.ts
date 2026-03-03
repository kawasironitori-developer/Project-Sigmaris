import type { CharacterPersona } from "../types";

import { alicePersona } from "./alice";
import { ayaPersona } from "./aya";
import { flandrePersona } from "./flandre";
import { koishiPersona } from "./koishi";
import { marisaPersona } from "./marisa";
import { momijiPersona } from "./momiji";
import { nitoriPersona } from "./nitori";
import { reimuPersona } from "./reimu";
import { remiliaPersona } from "./remilia";
import { sakuyaPersona } from "./sakuya";
import { satoriPersona } from "./satori";
import { youmuPersona } from "./youmu";

export const OVERRIDES: Record<string, CharacterPersona> = {
  reimu: reimuPersona,
  marisa: marisaPersona,
  alice: alicePersona,
  aya: ayaPersona,
  momiji: momijiPersona,
  nitori: nitoriPersona,
  youmu: youmuPersona,
  remilia: remiliaPersona,
  sakuya: sakuyaPersona,
  flandre: flandrePersona,
  satori: satoriPersona,
  koishi: koishiPersona,
};

