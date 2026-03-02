import { useState, useEffect } from "react";
import { History, Search, PlusCircle, Settings, Edit3 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SidebarLeftProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SidebarLeft({ isOpen, onClose }: SidebarLeftProps) {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');

    useEffect(() => {
        // Apply theme classes to html element
        if (theme === 'system') {
            document.documentElement.classList.remove('dark', 'light');
        } else if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
        } else {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ x: -300, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -300, opacity: 0 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                    className="w-64 h-full bg-[var(--notion-sidebar)] border-r border-[var(--notion-border)] flex flex-col pt-4 absolute md:relative z-20 shadow-lg md:shadow-none"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 pb-4">
                        <div className="flex items-center gap-2 text-[var(--notion-text-light)] text-sm font-medium p-1.5 rounded transition-colors group">
                            <img src="/logo.png" alt="obx" className="w-6 h-6 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                            <span className="group-hover:text-[var(--notion-text)]">obx</span>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-1 rounded bg-transparent hover:bg-[var(--notion-hover)] text-[var(--notion-text-light)] transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                    </div>

                    <div className="px-3 pb-2 pt-2">
                        <button className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-sm text-[var(--notion-text)] hover:bg-[var(--notion-hover)] rounded transition-colors group">
                            <Search size={16} className="text-[var(--notion-text-light)] group-hover:text-[var(--notion-text)] transition-colors" />
                            Search
                        </button>
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-sm text-[var(--notion-text)] hover:bg-[var(--notion-hover)] rounded transition-colors group"
                        >
                            <Settings size={16} className="text-[var(--notion-text-light)] group-hover:text-[var(--notion-text)] transition-colors" />
                            Settings
                        </button>
                        <button className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-sm text-[var(--notion-text)] hover:bg-[var(--notion-hover)] rounded transition-colors group mt-2">
                            <Edit3 size={16} className="text-[var(--notion-text-light)] group-hover:text-[var(--notion-text)] transition-colors" />
                            New chat
                        </button>
                    </div>

                    {/* Chat History Section */}
                    <div className="flex-1 overflow-y-auto mt-4 px-3">
                        <div className="text-xs font-semibold text-[var(--notion-text-light)] mb-2 px-2">Recently opened</div>
                        {/* Placeholder for now */}
                        <div className="flex flex-col gap-0.5">
                            <button className="w-full text-left px-2 py-1.5 text-sm text-[var(--notion-text)] hover:bg-[var(--notion-hover)] rounded transition-colors truncate">
                                Chat history
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Simple Settings Modal */}
            <AnimatePresence>
                {isSettingsOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
                        onClick={() => setIsSettingsOpen(false)}
                    >
                        <div
                            className="bg-[var(--background)] border border-[var(--notion-border)] p-6 rounded-xl shadow-xl w-80 flex flex-col gap-4 text-[var(--notion-text)]"
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 className="font-semibold text-lg border-b border-[var(--notion-border)] pb-2">Settings</h3>
                            <div>
                                <label className="text-sm text-[var(--notion-text-light)] block mb-2">Color Theme</label>
                                <select
                                    value={theme}
                                    onChange={(e) => setTheme(e.target.value as any)}
                                    className="w-full bg-[var(--notion-sidebar)] border border-[var(--notion-border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[#7b61ff]"
                                >
                                    <option value="system">System Default</option>
                                    <option value="light">Light Mode</option>
                                    <option value="dark">Dark Mode</option>
                                </select>
                            </div>
                            <button
                                onClick={() => setIsSettingsOpen(false)}
                                className="mt-2 w-full py-1.5 bg-[#7b61ff] text-white rounded-md text-sm font-medium hover:bg-[#684be3] transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </AnimatePresence>
    );
}
