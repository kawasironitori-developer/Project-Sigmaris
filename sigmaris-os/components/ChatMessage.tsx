export default function ChatMessage({
  role,
  content,
}: {
  role: string;
  content: string;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} my-1`}>
      <div
        className={`p-2 max-w-[80%] rounded-lg ${
          isUser ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-100"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
