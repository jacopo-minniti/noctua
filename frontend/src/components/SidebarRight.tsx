import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Layers, Lightbulb, FileText, ArrowRightCircle, Link as LinkIcon, File } from "lucide-react";

interface SidebarRightProps {
    isOpen: boolean;
    onClose: () => void;
    activeContext?: string | null;
    messages?: { role: string; content: string }[];
}

export default function SidebarRight({ isOpen, onClose, activeContext, messages = [] }: SidebarRightProps) {
    const [activeTab, setActiveTab] = useState<"artifacts" | "sources">("artifacts");

    const sources = useMemo(() => {
        const extractedSources: { title: string, href: string, isVaultNote: boolean }[] = [];
        const linkRegex = /(?<!\!)\[([^\]]+)\]\(([^)]+)\)/g;

        // Also capture the legacy string-based citations just in case
        const legacyRegex = /\[vault note: ([^\]]+)\]/g;

        const assistMsgs = messages.filter(m => m.role === "assistant" || m.role === "user"); // Actually, just assistant is fine usually, but maybe user too?

        assistMsgs.forEach(msg => {
            let match;
            // Markdown Links
            while ((match = linkRegex.exec(msg.content)) !== null) {
                const title = match[1];
                let href = match[2];
                const isVaultNote = href.startsWith("obsidian://") || href.includes(".md");

                if (isVaultNote && !href.startsWith("obsidian://")) {
                    const parts = href.split("#");
                    const filename = parts[0].replace(/ /g, "%20") + (!parts[0].endsWith(".md") ? ".md" : "");
                    const header = parts.length > 1 ? `#${parts.slice(1).join("#").replace(/ /g, "%20")}` : "";
                    href = `obsidian://open?vault=${encodeURIComponent("Jacopo's Vault")}&file=${filename}${header}`;
                }

                if (!extractedSources.some(s => s.href === href)) {
                    extractedSources.push({ title, href, isVaultNote });
                }
            }

            // Legacy
            while ((match = legacyRegex.exec(msg.content)) !== null) {
                const text = match[1];
                const parts = text.split(">");
                const filename = parts[0].trim();
                const header = parts.length > 1 ? `#${parts[1].trim()}` : "";
                const href = `obsidian://open?vault=${encodeURIComponent("Jacopo's Vault")}&file=${encodeURIComponent(filename)}${encodeURIComponent(header)}`;

                if (!extractedSources.some(s => s.href === href)) {
                    extractedSources.push({ title: text, href, isVaultNote: true });
                }
            }
        });
        return extractedSources;
    }, [messages]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ x: 400, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 400, opacity: 0 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                    className="w-80 lg:w-96 h-full bg-[var(--background)] border-l border-[var(--notion-border)] flex flex-col absolute right-0 z-20 shadow-xl md:shadow-[-4px_0_24px_rgba(0,0,0,0.02)] md:relative"
                >
                    {/* Header Controls */}
                    <div className="flex items-center justify-between px-5 pt-4 pb-2">
                        <div className="flex items-center gap-2 font-medium text-[var(--notion-text)]">
                            <Layers size={18} className="text-[var(--notion-text-light)]" />
                            <span>Context Panel</span>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded bg-transparent hover:bg-[var(--notion-hover)] text-[var(--notion-text-light)] transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex px-5 space-x-6 border-b border-[var(--notion-border)] text-sm font-medium">
                        <button
                            onClick={() => setActiveTab("artifacts")}
                            className={`pb-2 outline-none transition-colors border-b-2 ${activeTab === "artifacts" ? 'border-[#7b61ff] text-[#7b61ff]' : 'border-transparent text-[var(--notion-text-light)] hover:text-[var(--notion-text)]'}`}
                        >
                            Artifacts & Pipelines
                        </button>
                        <button
                            onClick={() => setActiveTab("sources")}
                            className={`pb-2 outline-none transition-colors border-b-2 flex items-center gap-1 ${activeTab === "sources" ? 'border-[#7b61ff] text-[#7b61ff]' : 'border-transparent text-[var(--notion-text-light)] hover:text-[var(--notion-text)]'}`}
                        >
                            Sources
                            {sources.length > 0 && (
                                <span className="bg-[#7b61ff]/10 text-[#7b61ff] text-xs px-1.5 py-0.5 rounded-full ml-1 font-semibold">
                                    {sources.length}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 pb-24">
                        {activeTab === "artifacts" && (
                            <>
                                {!activeContext ? (
                                    <div className="flex flex-col items-center justify-center text-center h-full text-[var(--notion-text-light)]">
                                        <Lightbulb size={32} className="mb-4 opacity-50" />
                                        <p className="text-sm px-4">
                                            Tools, artifacts, and secondary pipelines like flashcards will appear here when invoked by the agent or yourself.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {/* Placeholder for specific active contexts like Flashcards */}
                                        <div className="bg-[var(--notion-bg)] border border-[var(--notion-border)] rounded-lg shadow-sm overflow-hidden">
                                            <div className="bg-[var(--notion-sidebar)] px-4 py-2 border-b border-[var(--notion-border)] flex items-center gap-2">
                                                <FileText size={16} className="text-[var(--notion-text-light)]" />
                                                <span className="text-sm font-medium">Flashcards Session</span>
                                            </div>
                                            <div className="p-6 flex flex-col items-center justify-center h-48 bg-[var(--background)]">
                                                <p className="text-center text-[var(--notion-text)] font-medium mb-4">Sample Flashcard</p>
                                                <p className="text-sm text-[var(--notion-text-light)] text-center mb-6">Click to flip and reveal answer.</p>
                                                <button className="btn-notion bg-[#2383e2] text-white hover:bg-[#1f73c4] px-4 py-2 rounded-md shadow flex items-center gap-2">
                                                    <ArrowRightCircle size={16} />
                                                    Start Review
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {activeTab === "sources" && (
                            <div className="flex flex-col gap-3">
                                {sources.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center text-center h-full text-[var(--notion-text-light)] mt-10">
                                        <LinkIcon size={32} className="mb-4 opacity-50" />
                                        <p className="text-sm px-4">
                                            No sources have been cited in this chat yet.
                                        </p>
                                    </div>
                                ) : (
                                    sources.map((source, i) => (
                                        <a
                                            key={i}
                                            href={source.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group flex flex-col p-3 rounded-lg border border-[var(--notion-border)] hover:bg-[var(--notion-hover)] transition-all bg-[var(--background)] shadow-sm"
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                {source.isVaultNote ? (
                                                    <img src="/obsidian-sources-icon.png" alt="Obsidian" className="w-4 h-4 object-contain inline" />
                                                ) : (
                                                    <img src="/web-sources-icon.png" alt="Web" className="w-4 h-4 object-contain inline" />
                                                )}
                                                <span className={`text-sm font-medium truncate text-[#7b61ff] dark:text-[#a08cff]`}>
                                                    {source.title}
                                                </span>
                                            </div>
                                            <span className="text-xs text-[var(--notion-text-light)] truncate overflow-hidden pl-6">
                                                {decodeURIComponent(source.href.replace(`obsidian://open?vault=${encodeURIComponent("Jacopo's Vault")}&file=`, ""))}
                                            </span>
                                        </a>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
