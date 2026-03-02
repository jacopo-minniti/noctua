"use client";

import { useState } from "react";
import { Menu, PanelRightClose, PanelRightOpen } from "lucide-react";
import SidebarLeft from "@/components/SidebarLeft";
import SidebarRight from "@/components/SidebarRight";
import MainChat, { Message } from "@/components/MainChat";

export default function Home() {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [activeRightContext, setActiveRightContext] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const toggleLeftSidebar = () => setLeftSidebarOpen(!leftSidebarOpen);

  const toggleRightSidebar = () => {
    if (rightSidebarOpen) {
      setRightSidebarOpen(false);
      setActiveRightContext(null);
    } else {
      setRightSidebarOpen(true);
    }
  };

  const openRightSidebarWithContext = (context: string) => {
    setActiveRightContext(context);
    setRightSidebarOpen(true);
  };

  return (
    <div className="flex h-screen w-full bg-[var(--background)] text-[var(--notion-text)] overflow-hidden font-sans">

      {/* Mobile Header overlays */}
      <div className="md:hidden absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto bg-[var(--background)]/80 backdrop-blur border border-[var(--notion-border)] p-1.5 rounded-md shadow-sm text-[var(--notion-text)]">
          <button onClick={toggleLeftSidebar} className="p-1 hover:bg-[var(--notion-hover)] rounded">
            <Menu size={18} className="text-[var(--notion-text-light)]" />
          </button>
          <img src="/logo.png" alt="noctua" className="w-5 h-5 object-contain" />
          <span className="font-semibold text-sm mr-1">noctua</span>
        </div>
        <button
          onClick={toggleRightSidebar}
          className="p-2 rounded-md bg-[var(--background)]/80 backdrop-blur border border-[var(--notion-border)] shadow-sm pointer-events-auto text-[var(--notion-text-light)] relative"
        >
          {rightSidebarOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
          {activeRightContext && !rightSidebarOpen && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#eb5757]"></span>
          )}
        </button>
      </div>

      {/* Desktop overlay buttons when closed */}
      <div className="hidden md:flex items-center gap-2 absolute top-4 left-4 z-10">
        {!leftSidebarOpen && (
          <>
            <button
              onClick={toggleLeftSidebar}
              className="p-1.5 rounded-md hover:bg-[var(--notion-hover)] text-[var(--notion-text-light)] transition-colors group relative"
              title="Open sidebar"
            >
              <Menu size={20} className="group-hover:text-[var(--notion-text)] transition-colors" />
            </button>
            <div className="flex items-center gap-2 select-none pointer-events-none opacity-80 backdrop-blur-sm bg-[var(--background)]/50 px-2 py-1 rounded-md border border-[var(--notion-border)]">
              <img src="/logo.png" alt="noctua" className="w-5 h-5 object-contain" />
              <span className="font-semibold text-sm text-[var(--notion-text)]">noctua</span>
            </div>
          </>
        )}
      </div>

      <div className="hidden md:block absolute top-4 right-4 z-10">
        {!rightSidebarOpen && (
          <button
            onClick={toggleRightSidebar}
            className="p-1.5 rounded-md hover:bg-[var(--notion-hover)] text-[var(--notion-text-light)] transition-colors group relative"
            title="Open tools sidebar"
          >
            <PanelRightOpen size={20} className="group-hover:text-[var(--notion-text)] transition-colors" />
            {activeRightContext && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#eb5757]"></span>
            )}
          </button>
        )}
      </div>

      {/* Left Sidebar */}
      <SidebarLeft isOpen={leftSidebarOpen} onClose={() => setLeftSidebarOpen(false)} />

      {/* Main Center Area */}
      <MainChat onOpenRightSidebar={openRightSidebarWithContext} messages={messages} setMessages={setMessages} />

      {/* Right Sidebar */}
      <SidebarRight
        isOpen={rightSidebarOpen}
        onClose={() => setRightSidebarOpen(false)}
        activeContext={activeRightContext}
        messages={messages}
      />

    </div>
  );
}
