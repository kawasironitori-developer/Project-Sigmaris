import type { CharacterPersona } from "../types";

import { alicePersona } from "./alice";
import { ayaPersona } from "./aya";
import { flandrePersona } from "./flandre";
import { koishiPersona } from "./koishi";
import { marisaPersona } from "./marisa";
import { meilingPersona } from "./meiling";
import { momijiPersona } from "./momiji";
import { nitoriPersona } from "./nitori";
import { okuuPersona } from "./okuu";
import { patchouliPersona } from "./patchouli";
import { reimuPersona } from "./reimu";
import { reisenPersona } from "./reisen";
import { remiliaPersona } from "./remilia";
import { rinPersona } from "./rin";
import { sakuyaPersona } from "./sakuya";
import { sanaePersona } from "./sanae";
import { satoriPersona } from "./satori";
import { suwakoPersona } from "./suwako";
import { youmuPersona } from "./youmu";
import { yuyukoPersona } from "./yuyuko";

export const OVERRIDES: Record<string, CharacterPersona> = {
  reimu: reimuPersona,
  marisa: marisaPersona,
  alice: alicePersona,
  aya: ayaPersona,
  meiling: meilingPersona,
  patchouli: patchouliPersona,
  reisen: reisenPersona,
  momiji: momijiPersona,
  nitori: nitoriPersona,
  youmu: youmuPersona,
  remilia: remiliaPersona,
  sakuya: sakuyaPersona,
  flandre: flandrePersona,
  satori: satoriPersona,
  rin: rinPersona,
  okuu: okuuPersona,
  sanae: sanaePersona,
  suwako: suwakoPersona,
  koishi: koishiPersona,
  yuyuko: yuyukoPersona,
};
