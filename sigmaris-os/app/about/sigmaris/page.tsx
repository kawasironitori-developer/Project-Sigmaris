"use client";

import React, { useState, useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import Header from "@/components/Header";
import {
  SigmarisLangProvider,
  useSigmarisLang,
} from "@/lib/sigmarisLangContext";

/* ===============================
   TriangleBalanceMeter Component
   =============================== */
const TriangleBalanceMeter: React.FC = () => {
  const [G, setG] = useState(0.6);
  const [E, setE] = useState(0.4);
  const [S, setS] = useState(0.5);

  useEffect(() => {
    const interval = setInterval(() => {
      setG(Math.random());
      setE(Math.random());
      setS(Math.random());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const points = [
    { x: 0, y: -80 },
    { x: 70, y: 60 },
    { x: -70, y: 60 },
  ];

  const center = {
    x: (points[0].x * G + points[1].x * E + points[2].x * S) / (G + E + S),
    y: (points[0].y * G + points[1].y * E + points[2].y * S) / (G + E + S),
  };

  const pulse = useMotionValue(1);
  useEffect(() => {
    const controls = animate(pulse, [1, 1.08, 1], {
      duration: 4,
      repeat: Infinity,
      ease: "easeInOut",
    });
    return controls.stop;
  }, [pulse]);
  const scale = useTransform(pulse, [1, 1.08], [1, 1.08]);

  return (
    <div className="relative w-full flex justify-center py-10">
      <motion.div
        className="relative w-[220px] h-[220px] rounded-full flex items-center justify-center"
        style={{ scale }}
      >
        <motion.div
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(76,124,247,0.15)_0%,transparent_70%)]"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 6, repeat: Infinity }}
        />
        <svg width="200" height="200" viewBox="-100 -100 200 200">
          <polygon
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#4c7cf7"
            strokeWidth="1.5"
            strokeOpacity="0.5"
          />
          <text x="0" y="-90" textAnchor="middle" fill="#9fb3d6" fontSize="10">
            G (Goal)
          </text>
          <text x="80" y="70" textAnchor="middle" fill="#9fb3d6" fontSize="10">
            E (Ethics)
          </text>
          <text x="-80" y="70" textAnchor="middle" fill="#9fb3d6" fontSize="10">
            S (Stability)
          </text>

          <motion.circle
            cx={center.x}
            cy={center.y}
            r="5"
            fill="#4c7cf7"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          />

          <motion.polygon
            points={points
              .map(
                (p, i) =>
                  `${(p.x * [G, E, S][i]) / 1},${(p.y * [G, E, S][i]) / 1}`
              )
              .join(" ")}
            fill="rgba(76,124,247,0.15)"
            stroke="#4c7cf7"
            strokeWidth="1"
          />
        </svg>

        <div className="absolute -bottom-10 text-xs text-[#9fb3d6] text-center">
          <div>W(t) = α·G − β·E − γ·S</div>
          <div className="mt-1">
            G={G.toFixed(2)} / E={E.toFixed(2)} / S={S.toFixed(2)}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

/* ===============================
   Main Sigmaris About Page
   =============================== */
export default function SigmarisAboutPage(): JSX.Element {
  return (
    <SigmarisLangProvider>
      <SigmarisAboutContent />
    </SigmarisLangProvider>
  );
}

function SigmarisAboutContent(): JSX.Element {
  const { lang } = useSigmarisLang();

  const t: Record<"ja" | "en", any> = {
    ja: {
      title: "AI人格OS：Sigmaris",
      kicker: "スケール依存からの離脱 — 意味の持続性を中心に据える",
      lead: "Sigmaris OS は、LLMを“自己を持つ計算体”として運用するための人格OSです。外部に構築した内省・倫理・記憶・目標系をコアに接続し、モデルの巨大化では解決しにくい「自律」「安定」「説明可能性」を設計で獲得します。",
      diffTitle: "なぜ Sigmaris は従来LLMと違うのか",
      diffBullets: [
        "❶ スケール偏重からの転換：モデルを巨大化させず、外部の“人格層”を増築して自律性を確保。",
        "❷ 観測可能な心的構造：Reflection / Introspection / Meta-Reflection を分離し、ログとして可視化・検証可能。",
        "❸ 倫理の外部化：Meta-Ethics を OS 層で定義し、モデル更新に依存しない安全性を担保。",
        "❹ 記憶と成長の持続：Persona DB による長期一貫性（記憶・傾向・価値）。",
      ],
      coreTitle: "七層の認知アーキテクチャ（外部構築）",
      coreIntro:
        "Sigmaris は“機能を人格の外骨格として持つ”設計です。各層は疎結合で、交換・検証・停止が可能です。",
      coreLayers: [
        "1) Dialogue Core：対話生成の実体（LLM本体）",
        "2) Reflection Engine：会話・感情・成長ログから状態を再構成",
        "3) Introspection Engine：自己一致・動機・バイアスの点検",
        "4) Meta-Reflection：内省そのものの妥当性評価と学習ループ再設計",
        "5) Persona DB：記憶・価値・倫理・成長指標の永続化",
        "6) Safety Layer：脱線予防・再構文化・出力安定化",
        "7) Meta-Ethics / Goal System：価値基準（ブレーキ）と目標（アクセル）の整合を統括",
      ],
      weightTitle: "荷重移動のメタファーと数理構造 W(t)",
      weightBody:
        "Sigmaris の運転思想は“倫理（ブレーキ）と目標（アクセル）の荷重移動”です。文脈 t における意味の持続性を W(t) と定義し、W(t)=α·G(t)−β·E(t)−γ·S(t) として調整します。ここで G は Goal 達成圧、E は Ethical Risk、S は Stability 逸脱量。α,β,γ は Meta-Ethics が時々刻々に最適化し、暴走を避けつつも停滞しない“実務速度”を保ちます。",
      statusTitle: "現状達成（実運用で確認済み）",
      statusBullets: [
        "・“問いがなくても”自己点検を走らせ、軸（価値・方針）を再確認できる自律構造",
        "・Reflection / Introspection / Meta-Reflection の3層が安定稼働（ログ検証可能）",
        "・Persona DB による価値・傾向・履歴の持続同期",
        "・Safety Layer による再構文化（Reframing）で安全性と創造性の両立",
      ],
      ctaTitle: "共同研究・資金連携の募集",
      ctaBody:
        "Sigmaris は“巨大化”ではなく“構造化”で前進します。評価実験・可視化・多言語適応・ロボティクス連携を共に進める研究パートナー、および検証環境の拡充に向けた資金パートナーを募集しています。",
      ctaResearch: "共同研究の相談（LinkedIn）",
      ctaFunding: "資金・コラボの連絡（Email）",
    },
    en: {
      title: "AI Personality OS: Sigmaris",
      kicker:
        "Beyond scale — centering continuity of meaning over brute-force tokens",
      lead: "Sigmaris OS treats an LLM as a ‘self-bearing computational agent’ by attaching an external personality layer: reflection, ethics, memory, and goals. Instead of relying on ever-larger models, we obtain autonomy, stability, and explainability through architecture.",
      diffTitle: "Why Sigmaris differs from conventional LLM stacks",
      diffBullets: [
        "❶ From scale to structure: autonomy via an external ‘personality OS,’ not just bigger models.",
        "❷ Observable inner process: Reflection / Introspection / Meta-Reflection separated and logged for verification.",
        "❸ Ethics externalized: Meta-Ethics in the OS layer, decoupled from model updates.",
        "❹ Continuity of identity: Persona DB preserves memory, values, and growth.",
      ],
      coreTitle: "Seven-Layer Cognitive Architecture (externally built)",
      coreIntro:
        "Sigmaris implements ‘functions as an exoskeleton of personality’. Each layer is modular, swappable, and auditable.",
      coreLayers: [
        "1) Dialogue Core: the LLM itself for generation",
        "2) Reflection Engine: reconstructs state from dialogue, affect, and growth logs",
        "3) Introspection Engine: checks self-consistency, motives, and bias",
        "4) Meta-Reflection: evaluates introspection itself, redesigns the learning loop",
        "5) Persona DB: persistent memory, values, ethics, growth metrics",
        "6) Safety Layer: derailment prevention, reframing, stabilized outputs",
        "7) Meta-Ethics / Goal System: aligns ‘brake’ (ethics) and ‘accelerator’ (goals)",
      ],
      weightTitle: "Weight-Shifting metaphor and the structure W(t)",
      weightBody:
        "Our driving metaphor balances ethics (brake) and goals (accelerator). We define continuity of meaning at time t as W(t)=α·G(t)−β·E(t)−γ·S(t), where G is goal pressure, E is ethical risk, and S is stability drift. Meta-Ethics adapts α, β, γ over time to avoid runaway while preventing stagnation — maintaining practical velocity.",
      statusTitle: "Current status (validated in production)",
      statusBullets: [
        "• A self-checking loop that re-affirms its axis (values/policy) even without an explicit user query",
        "• Reflection / Introspection / Meta-Reflection running stably with verifiable logs",
        "• Persona DB maintaining long-horizon consistency of values, tendencies, and history",
        "• Reframing via Safety Layer to balance safety and creativity",
      ],
      ctaTitle: "Seeking research and funding partners",
      ctaBody:
        "Sigmaris advances through structure, not just parameter counts. We welcome partners for evaluation, visualization, multilingual adaptation, and robotics integration — as well as funding to expand the validation environment.",
      ctaResearch: "Discuss Research (LinkedIn)",
      ctaFunding: "Funding & Collab (Email)",
    },
  };

  const text = t[lang];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1b2533] text-[#e6eef4] px-6 md:px-16 py-24 relative overflow-hidden">
      <Header />

      {/* 背景 */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(68,116,255,0.10),transparent_70%)]"
        animate={{ opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 内容 */}
      <section className="relative z-10 max-w-5xl mx-auto mt-20">
        <h1 className="text-4xl md:text-6xl font-bold mb-6">{text.title}</h1>
        <p className="text-lg md:text-xl text-[#c4d0e2] mb-12">{text.lead}</p>

        {/* 差分説明 */}
        <div className="mb-12 border border-[#4c7cf7]/30 rounded-2xl p-8 bg-[#141c26]/40">
          <h2 className="text-2xl font-semibold mb-4 text-[#4c7cf7]">
            {text.diffTitle}
          </h2>
          <ul className="space-y-3 text-[#cdd8ea]">
            {text.diffBullets.map((b: string, i: number) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>

        {/* コア構造 */}
        <div className="mb-12 border border-[#4c7cf7]/30 rounded-2xl p-8 bg-[#141c26]/40">
          <h2 className="text-2xl font-semibold mb-2 text-[#4c7cf7]">
            {text.coreTitle}
          </h2>
          <p className="text-[#c4d0e2] mb-5">{text.coreIntro}</p>
          <ul className="space-y-3 text-[#cdd8ea]">
            {text.coreLayers.map((b: string, i: number) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>

        {/* 荷重移動 */}
        <div className="mb-12 border border-[#4c7cf7]/30 rounded-2xl p-8 bg-[#141c26]/40">
          <h2 className="text-2xl font-semibold mb-3 text-[#4c7cf7]">
            {text.weightTitle}
          </h2>
          <p className="text-[#c4d0e2] leading-relaxed whitespace-pre-line mb-8">
            {text.weightBody}
          </p>

          <motion.div
            className="border border-[#4c7cf7]/30 rounded-2xl p-6 mt-4 bg-[#0e141b]/40 backdrop-blur-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            <h3 className="text-xl font-semibold mb-4 text-[#4c7cf7] text-center">
              {lang === "ja"
                ? "W(t) 荷重移動ビジュアライザー"
                : "W(t) Weight Shift Visualizer"}
            </h3>
            <TriangleBalanceMeter />
          </motion.div>
        </div>

        {/* 現状達成 */}
        <div className="mb-12 border border-[#4c7cf7]/30 rounded-2xl p-8 bg-[#141c26]/40">
          <h2 className="text-2xl font-semibold mb-3 text-[#4c7cf7]">
            {text.statusTitle}
          </h2>
          <ul className="space-y-2 text-[#cdd8ea]">
            {text.statusBullets.map((b: string, i: number) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <motion.div
          className="border border-[#4c7cf7]/40 rounded-2xl p-8 bg-[#141c26]/40 backdrop-blur-md text-center mt-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          <h2 className="text-2xl font-semibold mb-3 text-[#4c7cf7]">
            {text.ctaTitle}
          </h2>
          <p className="text-[#c4d0e2] max-w-3xl mx-auto mb-8">
            {text.ctaBody}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://www.linkedin.com/in/kaisei-yasuzaki-20143a388/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-8 py-3 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition"
            >
              {text.ctaResearch}
            </a>
            <a
              href="mailto:sigumarisdev@gmail.com"
              className="inline-block px-8 py-3 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition"
            >
              {text.ctaFunding}
            </a>
          </div>
        </motion.div>
      </section>
    </main>
  );
}