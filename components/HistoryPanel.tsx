// components/HistoryPanel.tsx
"use client";

interface Message {
  user: string;
  ai: string;
}

interface HistoryPanelProps {
  messages: Message[];
}

export default function HistoryPanel({ messages }: HistoryPanelProps) {
  if (!messages.length) {
    return (
      <div className="bg-gray-800 p-4 rounded-lg text-gray-400">
        No conversation history yet.
      </div>
    );
  }

  return (
    <div className="bg-gray-800 p-4 rounded-lg space-y-3 max-h-[400px] overflow-y-auto">
      {messages.map((msg, i) => (
        <div key={i} className="border-b border-gray-700 pb-2">
          <p className="text-blue-400 font-semibold">you：</p>
          <p className="mb-2">{msg.user}</p>
          <p className="text-pink-400 font-semibold">sigmaris：</p>
          <p className="mb-2">{msg.ai}</p>
        </div>
      ))}
    </div>
  );
}
