"use client";

interface ChatWindowProps {
  messages: { user: string; ai: string }[];
  onDelete: (index: number) => void;
}

export default function ChatWindow({ messages, onDelete }: ChatWindowProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 space-y-4 custom-scroll">
      {messages.length === 0 ? (
        <p className="text-gray-500 text-center mt-20">
          Your conversation will appear here.
        </p>
      ) : (
        messages.map((m, i) => (
          <div key={i} className="space-y-1 relative group">
            {/* user */}
            <div className="flex justify-end relative">
              <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl px-4 py-2 shadow-md whitespace-pre-line relative">
                {m.user}
                <button
                  onClick={() => onDelete(i)}
                  className="absolute top-1 right-2 text-xs text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-400 transition"
                  title="Delete"
                >
                  🗑
                </button>
              </div>
            </div>
            {/* ai */}
            <div className="flex justify-start relative">
              <div className="max-w-[80%] bg-gray-800 text-gray-100 rounded-2xl px-4 py-2 shadow-md whitespace-pre-line relative">
                {m.ai}
                <button
                  onClick={() => onDelete(i)}
                  className="absolute top-1 right-2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-400 transition"
                  title="削除"
                >
                  🗑
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
