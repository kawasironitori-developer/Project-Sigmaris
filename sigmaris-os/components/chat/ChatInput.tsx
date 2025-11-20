"use client";
import { useState } from "react";

interface ChatInputProps {
  onSend: () => void;
  onReflect: () => void;
  input: string;
  setInput: (value: string) => void;
  loading: boolean;
  reflecting: boolean;
  disabled?: boolean;
}

export default function ChatInput({
  onSend,
  onReflect,
  input,
  setInput,
  loading,
  reflecting,
  disabled,
}: ChatInputProps) {
  return (
    <footer className="border-t border-gray-800 p-3 flex items-center gap-2 bg-[#0d0d0d]">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSend()}
        placeholder="Type your message..."
        className="flex-grow bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
      />
      <button
        onClick={onSend}
        disabled={loading || disabled}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm disabled:opacity-50"
      >
        {loading ? "..." : "Send"}
      </button>
      <button
        onClick={onReflect}
        disabled={reflecting || disabled}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm disabled:opacity-50"
      >
        {reflecting ? "Reflecting..." : "Reflect"}
      </button>
    </footer>
  );
}
