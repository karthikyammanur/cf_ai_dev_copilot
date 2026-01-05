/**
 * Simple DevCopilot Chat App
 * Directly uses our custom API without the agents framework
 */

import { useState } from "react";
import { Button } from "@/components/button/Button";
import { Textarea } from "@/components/textarea/Textarea";
import { Card } from "@/components/card/Card";

export default function App() {
  const [messages, setMessages] = useState<
    Array<{ role: string; content: string }>
  >([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Call our custom API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage]
        })
      });

      const data = (await response.json()) as { response?: string };

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response || "No response" }
      ]);
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Error: Could not connect to DevCopilot API"
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-[#F6821F]">
          🤖 DevCopilot
        </h1>

        <div className="space-y-4 mb-4">
          {messages.map((msg, i) => (
            <Card
              key={i}
              className={`p-4 ${msg.role === "user" ? "bg-neutral-900" : "bg-neutral-800"}`}
            >
              <div className="font-semibold mb-2">
                {msg.role === "user" ? "You" : "DevCopilot"}
              </div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </Card>
          ))}
        </div>

        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask DevCopilot anything about Cloudflare Workers..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            className="flex-1"
          />
          <Button onClick={sendMessage} disabled={loading || !input.trim()}>
            {loading ? "..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
