import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Globe, FileUp, Sparkles, ChevronDown, Paperclip, AtSign, Github, Slack, Square } from "lucide-react";
import MessageRenderer from "./MessageRenderer";

export type Message = {
    role: "user" | "assistant";
    content: string;
};

interface MainChatProps {
    onOpenRightSidebar: (context: string) => void;
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export default function MainChat({ onOpenRightSidebar, messages, setMessages }: MainChatProps) {
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [webSearchEnabled, setWebSearchEnabled] = useState(true);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const hasStarted = messages.length > 0;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const scrollToBottom = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { role: "user", content: input };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        // Simulate opening flashcards sidebar for specific keywords
        if (input.toLowerCase().includes("flashcard") || input.toLowerCase().includes("exercise")) {
            onOpenRightSidebar("flashcards");
        }

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMessage.content, webSearchEnabled }),
            });

            if (!response.ok) throw new Error("Network response was not ok");
            if (!response.body) throw new Error("No body in response");

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let assistantMessageContent = "";

            // Add empty assistant message to be filled progressively
            setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                assistantMessageContent += chunk;

                setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = { role: "assistant", content: assistantMessageContent };
                    return newMessages;
                });
            }
        } catch (error) {
            console.error("Failed to fetch chat:", error);
            // Fallback local response for testing if backend isn't up
            setTimeout(() => {
                setMessages((prev) => [...prev, { role: "assistant", content: "I'm having trouble connecting to the backend. Please ensure the FastAPI server is running." }]);
                setIsLoading(false);
            }, 1000);
            return;
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-[var(--background)]">
            <style>{`
                .hide-scroll::-webkit-scrollbar {
                    display: none;
                }
                .hide-scroll {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
            {/* Messages Area */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto px-4 md:px-12 pb-32 pt-16 md:pt-24 w-full max-w-4xl mx-auto scroll-smooth hide-scroll"
            >
                {!hasStarted ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <h1 className="text-3xl md:text-4xl font-semibold mb-3 tracking-tight text-[var(--notion-text)]">
                            Welcome to jacopo-minniti
                        </h1>
                        <p className="text-[var(--notion-text-light)] text-lg mb-8 max-w-md">
                            Your intelligent companion for Obsidian. Ask anything about your vault, create flashcards, or search the web.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6 w-full pb-8">

                        {messages.map((msg, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                <MessageRenderer msg={msg} />
                            </motion.div>
                        ))}

                        {isLoading && (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="flex items-center gap-2 text-[var(--notion-text-light)] px-4 py-2"
                            >
                                <div className="flex space-x-1">
                                    <div className="w-1.5 h-1.5 bg-[var(--notion-text-light)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                                    <div className="w-1.5 h-1.5 bg-[var(--notion-text-light)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                                    <div className="w-1.5 h-1.5 bg-[var(--notion-text-light)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                                </div>
                            </motion.div>
                        )}
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="absolute bottom-0 w-full left-0 right-0 pt-10 pb-6 px-4 md:px-12 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pointer-events-none">
                <div className="max-w-4xl mx-auto w-full relative pointer-events-auto flex flex-col items-center">
                    {/* Selected File Badge */}
                    {selectedFile && (
                        <div className="self-start mb-2 bg-[var(--notion-hover)] border border-[var(--notion-border)] rounded-md px-3 py-1.5 flex items-center gap-2 text-sm text-[var(--notion-text)]">
                            <FileUp size={14} className="text-[var(--notion-text-light)]" />
                            <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                            <button
                                onClick={() => setSelectedFile(null)}
                                className="ml-1 text-[var(--notion-text-light)] hover:text-[#eb5757]"
                                title="Remove file"
                            >
                                &times;
                            </button>
                        </div>
                    )}
                    <form
                        onSubmit={handleSubmit}
                        className="flex items-center w-full bg-[var(--background)] border border-[var(--notion-border)] hover:border-[#cccccc] transition-colors rounded-full shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-[#7b61ff]/20 focus-within:border-[#7b61ff]/50 px-2 py-1.5 gap-2"
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask AI anything..."
                            className="flex-1 px-4 py-3 bg-transparent outline-none text-[var(--notion-text)] placeholder-[var(--notion-text-light)] truncate"
                        />

                        {/* Right side tools */}
                        <div className="flex items-center gap-2 flex-shrink-0 text-gray-500 mr-1">
                            {/* Hidden file input */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileChange}
                            />

                            {/* Sources Dropdown */}
                            <button
                                type="button"
                                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                            >
                                <div className="flex -space-x-1 hover:space-x-1 pr-1 transition-all">
                                    <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center -ml-1 border border-[var(--background)] shadow-sm">
                                        <Slack size={10} className="text-blue-500" />
                                    </div>
                                    <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center border border-[var(--background)] shadow-sm">
                                        <Github size={10} className="text-gray-700" />
                                    </div>
                                    <span className="text-[10px] ml-1 opacity-70">+2</span>
                                </div>
                                <span className="opacity-80">All sources</span>
                                <ChevronDown size={14} className="opacity-80" />
                            </button>

                            {/* Mention / AtSign */}
                            <button
                                type="button"
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors opacity-80 hover:opacity-100"
                            >
                                <AtSign size={18} />
                            </button>

                            {/* Attachment */}
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors opacity-80 hover:opacity-100"
                            >
                                <Paperclip size={18} />
                            </button>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={!input.trim() && !isLoading}
                                className={`ml-1 flex items-center justify-center w-8 h-8 rounded-full transition-all ${input.trim() || isLoading
                                    ? 'bg-black dark:bg-white text-white dark:text-black cursor-pointer shadow-md'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                    }`}
                            >
                                {isLoading ? (
                                    <Square size={12} className="fill-current" />
                                ) : (
                                    <Send size={14} className={input.trim() ? '-ml-0.5' : ''} />
                                )}
                            </button>
                        </div>
                    </form>
                    <div className="text-center mt-3 text-xs text-[var(--notion-text-light)] flex items-center justify-center gap-1 opacity-70">
                        obx can make mistakes. Consider checking important information.
                    </div>
                </div>
            </div>
        </div>
    );
}
