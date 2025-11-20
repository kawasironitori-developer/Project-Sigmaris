"use client";
import { motion, AnimatePresence } from "framer-motion";
import PersonaPanel from "@/components/PersonaPanel";
import ReflectionPanel from "@/components/ReflectionPanel";
import StatePanel from "@/components/StatePanel";
import EunoiaMeter from "@/components/EunoiaMeter";
import { TraitVisualizer } from "@/ui/TraitVisualizer";
import { SafetyIndicator } from "@/ui/SafetyIndicator";
import { EmotionBadge } from "@/ui/EmotionBadge";

interface RightPanelProps {
  rightOpen: boolean;
  closeRight: () => void;
  traits: any;
  reflectionText: string;
  metaSummary: string;
  safety: any;
}

export default function RightPanel({
  rightOpen,
  closeRight,
  traits,
  reflectionText,
  metaSummary,
  safety,
}: RightPanelProps) {
  const drawerTransition = { type: "tween", duration: 0.28, ease: "easeOut" };
  const safetyFlag =
    traits.calm < 0.3 && traits.curiosity > 0.7
      ? "思考過熱"
      : traits.empathy < 0.3 && traits.calm < 0.3
      ? "情動低下"
      : traits.calm > 0.9 && traits.empathy > 0.9
      ? "過安定（感情変化が鈍化）"
      : false;
  const toneColor =
    traits.empathy > 0.7 ? "#FFD2A0" : traits.calm > 0.7 ? "#A0E4FF" : "#AAA";

  return (
    <AnimatePresence>
      {rightOpen && (
        <motion.aside
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={drawerTransition}
          className="fixed lg:static z-50 right-0 h-full w-[300px] bg-[#1a1a1a] border-l border-gray-800 p-4 overflow-y-auto custom-scroll"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Sigmaris Mind</h2>
            <button onClick={closeRight} className="lg:hidden text-gray-400">
              ✕
            </button>
          </div>
          <div className="mt-3">
            <EmotionBadge tone="Current Tone" color={toneColor} />
          </div>
          <div className="mt-4 space-y-6">
            <SafetyIndicator
              message={safetyFlag ? safetyFlag : "Stable"}
              level={safetyFlag ? "notice" : "ok"}
            />
            <PersonaPanel traits={traits} />
            <TraitVisualizer data={[]} />
            <ReflectionPanel
              reflection={reflectionText}
              metaSummary={metaSummary}
            />
            <StatePanel
              traits={traits}
              reflection={reflectionText}
              metaReflection={metaSummary}
              safetyFlag={safetyFlag}
            />
            <EunoiaMeter traits={traits} safety={safety} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
