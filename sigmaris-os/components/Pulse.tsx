"use client";
import { motion } from "framer-motion";

export default function Pulse() {
  return (
    <motion.div
      className="w-3 h-3 rounded-full"
      style={{
        background: "#9be0ff", // 初期色（落ち着き系）
        boxShadow: "0 0 8px #9be0ff",
      }}
      animate={{
        scale: [1, 1.25, 1],
        boxShadow: ["0 0 8px #9be0ff", "0 0 16px #9be0ff", "0 0 8px #9be0ff"],
      }}
      transition={{
        duration: 1.6,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}
