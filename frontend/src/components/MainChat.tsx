import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, FileUp, ChevronDown, Paperclip, AtSign, Square } from "lucide-react";
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
    const [sourcesMenuOpen, setSourcesMenuOpen] = useState(false);
    const [webSearchEnabled, setWebSearchEnabled] = useState(true);
    const [scholarSearchEnabled, setScholarSearchEnabled] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const sourcesMenuRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const hasStarted = messages.length > 0;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const isUserScrolledUp = useRef(false);

    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        // Check if user is near the bottom
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        isUserScrolledUp.current = !isAtBottom;
    };

    const scrollToBottom = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        if (!isUserScrolledUp.current) {
            scrollToBottom();
        }
    }, [messages]);

    useEffect(() => {
        const onClickOutside = (event: MouseEvent) => {
            if (!sourcesMenuRef.current) return;
            if (!sourcesMenuRef.current.contains(event.target as Node)) {
                setSourcesMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    const stopGeneration = () => {
        abortControllerRef.current?.abort();
    };

    const submitMessage = async () => {
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
            const controller = new AbortController();
            abortControllerRef.current = controller;
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMessage.content,
                    webSearchEnabled,
                    scholarSearchEnabled,
                }),
                signal: controller.signal,
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
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }
            console.error("Failed to fetch chat:", error);
            // Fallback local response for testing if backend isn't up
            setTimeout(() => {
                setMessages((prev) => [...prev, { role: "assistant", content: "I'm having trouble connecting to the backend. Please ensure the FastAPI server is running." }]);
                setIsLoading(false);
            }, 1000);
            return;
        } finally {
            abortControllerRef.current = null;
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await submitMessage();
    };

    return (
        <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-[var(--background)]">
            {/* Messages Area */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 w-full overflow-y-auto scroll-smooth hide-scroll flex flex-col items-center"
            >
                <div className="w-full max-w-3xl px-4 md:px-6 pb-32 pt-16 md:pt-24 flex flex-col">
                    {!hasStarted ? (
                        <div className="flex flex-col items-center justify-center h-full text-center mt-12">
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
                                    <MessageRenderer msg={msg} isGenerating={isLoading && idx === messages.length - 1} />
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
            </div>

            {/* Input Area */}
            <div className="absolute bottom-0 w-full left-0 right-0 pt-10 pb-6 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pointer-events-none flex flex-col items-center">
                <div className="w-full max-w-3xl px-4 md:px-6 relative pointer-events-auto flex flex-col items-center">
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
                        className="relative w-full bg-[var(--background)] border border-[#7b61ff]/40 transition-colors rounded-[28px] shadow-[0_2px_10px_rgba(123,97,255,0.08)] overflow-visible focus-within:ring-2 focus-within:ring-[#7b61ff]/20 focus-within:border-[#7b61ff]/60 px-3"
                    >
                        <textarea
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                e.target.style.height = '96px';
                                e.target.style.height = `${Math.min(Math.max(e.target.scrollHeight, 96), 240)}px`;
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    submitMessage();
                                    e.currentTarget.style.height = '96px';
                                }
                            }}
                            placeholder="Ask noctua anything..."
                            rows={1}
                            className="w-full min-h-[96px] max-h-[240px] resize-none pl-4 pr-32 pt-6 pb-12 bg-transparent outline-none text-[var(--notion-text)] placeholder-[var(--notion-text-light)] leading-relaxed"
                        />

                        {/* Right side tools */}
                        <div className="absolute bottom-3 right-3 flex items-center gap-2 flex-shrink-0 text-gray-500">
                            {/* Hidden file input */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileChange}
                            />

                            {/* Sources Dropdown */}
                            <div className="relative hidden sm:block" ref={sourcesMenuRef}>
                                <button
                                    type="button"
                                    onClick={() => setSourcesMenuOpen((prev) => !prev)}
                                    className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1.5 rounded-md transition-colors ${sourcesMenuOpen
                                        ? "bg-[#7b61ff]/15 text-[#7b61ff]"
                                        : "hover:bg-[#7b61ff]/10 hover:text-[#7b61ff] text-[var(--notion-text-light)]"
                                        }`}
                                >
                                    <div className="flex -space-x-1 pr-1">
                                        <img src="/obsidian-sources-icon.png" alt="Vault" className="w-4 h-4 rounded-full border border-[var(--background)] bg-[var(--background)]" />
                                        {webSearchEnabled && (
                                            <img src="/web-sources-icon.png" alt="Web" className="w-4 h-4 rounded-full border border-[var(--background)] bg-[var(--background)]" />
                                        )}
                                        {scholarSearchEnabled && (
                                            <img src="/gscholar-icon.png" alt="Scholar" className="w-4 h-4 rounded-full border border-[var(--background)] bg-[var(--background)]" />
                                        )}
                                    </div>
                                    <span>All sources</span>
                                    <ChevronDown size={14} />
                                </button>
                                {sourcesMenuOpen && (
                                    <div className="absolute right-0 bottom-full mb-2 w-56 rounded-xl border border-[var(--notion-border)] bg-[var(--background)] shadow-xl p-2 z-30">
                                        <label className="flex items-center gap-2 px-2 py-2 rounded-md opacity-55 cursor-not-allowed">
                                            <input type="checkbox" checked disabled />
                                            <img src="/obsidian-sources-icon.png" alt="Vault" className="w-4 h-4 object-contain" />
                                            <span className="text-sm">Vault</span>
                                        </label>
                                        <label className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-[#7b61ff]/8 cursor-pointer">
                                            <input type="checkbox" checked={webSearchEnabled} onChange={(e) => setWebSearchEnabled(e.target.checked)} />
                                            <img src="/web-sources-icon.png" alt="Web" className="w-4 h-4 object-contain" />
                                            <span className="text-sm">Web</span>
                                        </label>
                                        <label className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-[#7b61ff]/8 cursor-pointer">
                                            <input type="checkbox" checked={scholarSearchEnabled} onChange={(e) => setScholarSearchEnabled(e.target.checked)} />
                                            <img src="/gscholar-icon.png" alt="Scholar" className="w-4 h-4 object-contain" />
                                            <span className="text-sm">Google Scholar</span>
                                        </label>
                                    </div>
                                )}
                            </div>

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
                            {isLoading ? (
                                <button
                                    type="button"
                                    onClick={stopGeneration}
                                    className="ml-1 flex items-center justify-center w-8 h-8 rounded-full transition-all bg-[#7b61ff] hover:bg-[#6a4fef] text-white cursor-pointer shadow-md"
                                    title="Stop generation"
                                >
                                    <Square size={12} className="fill-current" />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={!input.trim()}
                                    className={`ml-1 flex items-center justify-center w-8 h-8 rounded-full transition-all bg-[#7b61ff] text-white shadow-md ${input.trim() ? "hover:bg-[#6a4fef] cursor-pointer" : "cursor-not-allowed opacity-45"
                                        }`}
                                    title="Send message"
                                >
                                    <Send size={14} className={input.trim() ? "-ml-0.5" : ""} />
                                </button>
                            )}
                        </div>
                    </form>
                    <div className="text-center mt-3 text-xs text-[var(--notion-text-light)] flex items-center justify-center gap-1 opacity-70">
                        noctua can make mistakes. Consider checking important information.
                    </div>
                </div>
            </div>
        </div>
    );
}
