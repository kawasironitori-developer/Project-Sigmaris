import TopShell from "@/components/top/TopShell";
import {
  CHARACTERS,
  isCharacterSelectable,
  type CharacterDef,
} from "@/data/characters";
import { LOCATIONS, type LayerId } from "@/lib/map/locations";

import EntryLocationAccordion, {
  type EntryLayerGroup,
} from "@/app/entry/EntryLocationAccordion";
import EntryTouhouBackground from "@/app/entry/EntryTouhouBackground";
import styles from "@/app/entry/entry-theme.module.css";
import InViewFade from "@/components/ui/entry/InViewFade";

import EntryHeroSection from "@/components/entry/entryHero/EntryHeroSection";
import EntryInfoSection from "@/components/entry/entryInfo/EntryInfoSection";
import EntryCharactersHeader from "@/components/entry/entryCharacters/EntryCharactersHeader";
import EntryInstallSection from "@/components/entry/entryInstall/EntryInstallSection";
import EntryFooter from "@/components/entry/entryFooter/EntryFooter";
import EntrySelectionTracker from "@/components/entry/EntrySelectionTracker";

function layerLabel(layer: LayerId) {
  switch (layer) {
    case "gensokyo":
      return "幻想郷";
    case "deep":
      return "地底";
    case "higan":
      return "白玉楼";
  }
}

function groupLabelForCharacter(ch: CharacterDef): LayerId | null {
  const layer = ch.world?.map;
  if (layer === "gensokyo" || layer === "deep" || layer === "higan")
    return layer;
  return null;
}

function charactersByGroup(): Record<LayerId, CharacterDef[]> {
  const out: Record<LayerId, CharacterDef[]> = {
    gensokyo: [],
    deep: [],
    higan: [],
  };
  for (const ch of Object.values(CHARACTERS)) {
    // /entry は「選択可能（enabled=true かつ avatarあり）」のみ表示
    if (!isCharacterSelectable(ch)) continue;
    const g = groupLabelForCharacter(ch);
    if (!g) continue;
    out[g].push(ch);
  }
  for (const layer of ["gensokyo", "deep", "higan"] as const) {
    out[layer].sort((a, b) => {
      const al = String(a.world?.location ?? "");
      const bl = String(b.world?.location ?? "");
      if (al !== bl) return al.localeCompare(bl, "ja");
      return String(a.name).localeCompare(String(b.name), "ja");
    });
  }
  return out;
}

function charactersByLocationInLayer(layer: LayerId, chars: CharacterDef[]) {
  const locations = LOCATIONS.filter((l) => l.layer === layer);
  const locationIds = new Set(locations.map((l) => l.id));

  const byId = new Map<string, CharacterDef[]>();
  for (const ch of chars) {
    const loc = typeof ch.world?.location === "string" ? ch.world.location : "";
    if (!loc) continue;
    const arr = byId.get(loc) ?? [];
    arr.push(ch);
    byId.set(loc, arr);
  }

  for (const arr of byId.values()) {
    arr.sort((a, b) => String(a.name).localeCompare(String(b.name), "ja"));
  }

  const ordered = locations
    .map((loc) => ({
      id: loc.id,
      name: loc.name,
      characters: byId.get(loc.id) ?? [],
    }))
    .filter((g) => g.characters.length > 0);

  const others = [...byId.entries()]
    .filter(([id]) => !locationIds.has(id))
    .sort(([a], [b]) => a.localeCompare(b, "ja"))
    .map(([id, characters]) => ({
      id,
      name: id,
      characters,
    }))
    .filter((g) => g.characters.length > 0);

  return { ordered, others };
}

export default function EntryPageContent() {
  const byGroup = charactersByGroup();
  const layers: LayerId[] = ["gensokyo", "deep", "higan"];

  const layerData: EntryLayerGroup[] = layers.map((layer) => {
    const { ordered, others } = charactersByLocationInLayer(
      layer,
      byGroup[layer] ?? [],
    );
    const groups = [...ordered, ...others].map((g) => ({
      id: g.id,
      name: g.name,
      count: g.characters.length,
      characters: g.characters.map((ch) => ({
        id: ch.id,
        name: ch.name,
        title: ch.title,
        layer,
        locationId: g.id,
        locationName: g.name,
        world: ch.world,
        ui: ch.ui,
        promptVersion: ch.promptVersion,
      })),
    }));

    return {
      layer,
      label: layerLabel(layer),
      locations: groups,
    };
  });

  return (
    <TopShell
      scroll
      backgroundVariant="none"
      backgroundSlot={<EntryTouhouBackground />}
      className={`${styles.entryTheme} bg-background text-foreground`}
    >
      <div className="w-full max-w-6xl">
        <InViewFade reverse={true}>
          <EntryHeroSection />
        </InViewFade>
        <InViewFade reverse={false}>
          <EntryInfoSection />
        </InViewFade>
        <EntryCharactersHeader />
        <EntrySelectionTracker>
          <EntryLocationAccordion layers={layerData} />
        </EntrySelectionTracker>
        <InViewFade reverse={false}>
          <EntryInstallSection />
        </InViewFade>
        <EntryFooter />
      </div>
    </TopShell>
  );
}
