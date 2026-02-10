// app/map/[layer]/page.tsx
import { notFound } from "next/navigation";
import WorldMap from "@/components/map/session/WorldMap";
import {
  MAP_BACKGROUNDS,
  getLocationsByLayer,
  type LayerId,
} from "@/lib/map/locations";

const VALID_LAYERS: LayerId[] = ["gensokyo", "deep", "higan"];

export default async function MapPage({
  params,
}: {
  params: Promise<{ layer: string }>;
}) {
  // 🔴 ここが重要：params を await する
  const { layer } = await params;

  if (!VALID_LAYERS.includes(layer as LayerId)) {
    notFound();
  }

  const layerId = layer as LayerId;

  return (
    <WorldMap
      layer={layerId}
      backgroundSrc={MAP_BACKGROUNDS[layerId]}
      locations={getLocationsByLayer(layerId)}
    />
  );
}
