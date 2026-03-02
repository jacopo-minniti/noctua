import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Bot, Circle, Copy } from "lucide-react";
import type { ReactNode } from "react";

interface Message {
    role: "user" | "assistant";
    content: string;
}

interface MessageRendererProps {
    msg: Message;
    isGenerating?: boolean;
}

export default function MessageRenderer({ msg, isGenerating = false }: MessageRendererProps) {
    const [copied, setCopied] = useState(false);
    const isUser = msg.role === "user";

    // Extremely basic heuristic to detect if a message is a tool call or thinking process.
    const isToolCall = msg.role === "assistant" && (msg.content.startsWith("[TOOL]") || msg.content.includes("{\"tool\":"));

    let contentToRender = msg.content;
    if (isToolCall && contentToRender.startsWith("[TOOL]")) {
        contentToRender = contentToRender.replace("[TOOL]", "").trim();
    }

    // Split reasoning blocks dynamically if we enforce a specific block like <reasoning> ... </reasoning> in the future.
    // For now, if a message starts with "Thinking:" or "Action:", we render it as a ghosted sequence.
    const isReasoning = msg.role === "assistant" && (contentToRender.startsWith("Thinking:") || contentToRender.startsWith("Action:"));

    const copyMessage = async () => {
        await navigator.clipboard.writeText(contentToRender);
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
    };

    return (
        <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} group items-start gap-3`}>
            {!isUser && (
                <div className="w-8 h-8 rounded-full border border-[var(--notion-border)] flex items-center justify-center bg-[var(--background)] mt-1 flex-shrink-0">
                    <Bot size={16} className="text-[var(--notion-text-light)]" />
                </div>
            )}
            <div
                className={`${isUser ? 'px-5 py-3 rounded-[22px] rounded-tr-[4px]' : 'px-0 py-2 rounded-2xl'} max-w-[85%] ${isUser
                    ? 'bg-[#7b61ff]/[0.05] text-[var(--notion-text)] shadow-sm'
                    : isToolCall || isReasoning
                        ? 'bg-transparent text-[var(--notion-text-light)] opacity-80 backdrop-blur-sm'
                        : 'bg-transparent text-[var(--notion-text)]'
                    }`}
            >
                {(isToolCall || isReasoning) && (
                    <div className="flex flex-col gap-0 mb-3 text-xs font-medium text-[var(--notion-text-light)] relative ml-2 border-l-2 border-[var(--notion-border)] pl-4">
                        <div className="absolute -left-[9px] top-0.5 bg-[var(--background)] rounded-full text-[var(--notion-text-light)]">
                            <Circle size={14} className="fill-[var(--notion-border)]" />
                        </div>
                        <div className="text-sm pt-0">{isReasoning ? "Reasoning Process" : "Agent Action"}</div>
                    </div>
                )}
                <div className={`leading-relaxed prose prose-sm md:prose-base max-w-none prose-p:mb-5 prose-headings:mt-6 prose-headings:mb-4 prose-hr:my-8 ${isToolCall || isReasoning ? 'text-[var(--notion-text-light)] pl-6 text-sm' : ''}`}>
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                            a: (props) => {
                                const isVaultNote = props.href?.startsWith("obsidian://") || props.href?.includes(".md") || props.children?.toString().includes("vault note:");
                                const isWebSource = props.href?.startsWith("http");
                                const rawChildren = Array.isArray(props.children) ? props.children.join("") : String(props.children ?? "");
                                const isScholarSource = rawChildren.toLowerCase().startsWith("scholar:") || props.href?.includes("scholar.google.");

                                // Parse [vault note: ...] implicitly from agent without manual wrapper
                                if (typeof props.children === 'string' && props.children.startsWith("vault note:")) {
                                    const text = props.children.replace("vault note:", "").trim();
                                    const parts = text.split(">");
                                    const filename = parts[0].trim();
                                    const header = parts.length > 1 ? `#${parts[1].trim()}` : "";
                                    return (
                                        <a href={`obsidian://open?vault=${encodeURIComponent("Jacopo's Vault")}&file=${encodeURIComponent(filename)}${encodeURIComponent(header)}`} className="inline-flex items-center gap-1 hover:underline transition-all text-[#7b61ff] dark:text-[#a08cff] font-medium pb-0.5">
                                            <img src="/obsidian-sources-icon.png" alt="Obsidian" className="w-4 h-4 inline mb-0.5 object-contain" />
                                            {text}
                                        </a>
                                    )
                                }

                                // Explicitly handle markdown vault note syntax
                                if (isVaultNote && props.children) {
                                    let textToRender = props.children;
                                    if (typeof props.children === 'string' && props.children.startsWith("vault note:")) {
                                        textToRender = props.children.replace("vault note:", "").trim();
                                    } else if (Array.isArray(props.children)) {
                                        const firstChild = props.children[0];
                                        if (typeof firstChild === 'string' && firstChild.startsWith("vault note:")) {
                                            textToRender = firstChild.replace("vault note:", "").trim();
                                        }
                                    }

                                    return (
                                        <a
                                            {...props}
                                            target={undefined}
                                            className="inline-flex items-center gap-1 hover:underline transition-all pb-0.5 text-[#7b61ff] dark:text-[#a08cff] font-medium"
                                        >
                                            <img src="/obsidian-sources-icon.png" alt="Obsidian" className="w-4 h-4 inline mb-0.5 object-contain" />
                                            {textToRender}
                                        </a>
                                    );
                                }

                                return (
                                    <a
                                        {...props}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`inline-flex items-center gap-1 hover:underline transition-all border-b pb-0.5 ${isWebSource ? 'text-[#7b61ff] dark:text-[#a08cff] font-medium border-[#7b61ff]/30' : 'text-[#7b61ff] dark:text-[#a08cff] underline'
                                            }`}
                                    >
                                        {isWebSource && (
                                            <img
                                                src={isScholarSource ? "/gscholar-icon.png" : "/web-sources-icon.png"}
                                                alt={isScholarSource ? "Scholar" : "Web"}
                                                className="w-4 h-4 inline mb-0.5 object-contain"
                                            />
                                        )}
                                        {props.children}
                                    </a>
                                );
                            },
                            p: (props) => <p className="mb-4 last:mb-0 leading-loose" {...props} />,
                            h1: (props) => <h1 className="!text-3xl !font-bold mt-8 mb-4 tracking-tight text-[var(--notion-text)]" {...props} />,
                            h2: (props) => <h2 className="!text-2xl !font-bold mt-6 mb-3 tracking-snug text-[var(--notion-text)]" {...props} />,
                            h3: (props) => <h3 className="!text-xl !font-semibold mt-5 mb-2 text-[var(--notion-text)]" {...props} />,
                            h4: (props) => <h4 className="!text-lg !font-semibold mt-4 mb-2 text-[var(--notion-text)]" {...props} />,
                            hr: (props) => <hr className="my-8 border-t-2 border-[var(--notion-border)]" {...props} />,
                            ul: (props) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
                            ol: (props) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
                            li: (props) => <li className="mb-1" {...props} />,
                            code: ({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: ReactNode }) => {
                                const match = /language-(\w+)/.exec(className || '');
                                const isInline = inline || (!match && !String(children).includes('\n'));
                                if (isInline) {
                                    return (
                                        <code
                                            className="inline rounded-[4px] bg-[var(--notion-hover)] border border-[var(--notion-border)] text-black dark:text-white font-mono text-[0.85em] px-1.5 py-0.5 align-baseline font-medium"
                                            {...props}
                                        >
                                            {children}
                                        </code>
                                    );
                                }
                                const lang = match && match[1] ? match[1] : 'text';
                                const codeText = String(children ?? "").replace(/\n$/, "");
                                return (
                                    <div className="my-4 rounded-xl overflow-hidden shadow-sm bg-[var(--notion-hover)] border border-[var(--notion-border)] max-w-full">
                                        <div className="flex items-center justify-between px-4 py-2 bg-[var(--notion-border)] border-b border-[var(--notion-border)]">
                                            <span className="text-xs font-semibold text-[var(--notion-text-light)] capitalize tracking-wider">{lang === 'text' ? 'Code' : lang}</span>
                                            <button
                                                onClick={() => navigator.clipboard.writeText(codeText)}
                                                className="text-[var(--notion-text-light)] hover:text-[#7b61ff] transition-colors"
                                                title="Copy to clipboard"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                            </button>
                                        </div>
                                        <div className="p-4 overflow-x-auto hide-scroll">
                                            <code className="text-[13px] leading-relaxed font-mono text-black dark:text-gray-200" {...props}>
                                                {children}
                                            </code>
                                        </div>
                                    </div>
                                );
                            },
                            pre: ({ children }) => <div className="my-0">{children}</div>,
                            blockquote: (props) => <blockquote className="border-l-3 border-[var(--notion-border)] pl-4 italic text-[var(--notion-text-light)] my-4" {...props} />
                        }}
                    >
                        {contentToRender}
                    </ReactMarkdown>
                </div>
                {!isUser && !isToolCall && !isGenerating && (
                    <div className="mt-2 mb-4 flex justify-start opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button
                            type="button"
                            onClick={copyMessage}
                            className={`inline-flex items-center gap-1.5 text-xs bg-[var(--notion-bg)] px-2 py-1 rounded-md transition-all shadow-sm border ${copied
                                ? 'border-[#7b61ff]/30 text-[#7b61ff] bg-[#7b61ff]/10'
                                : 'border-[var(--notion-border)] text-[var(--notion-text-light)] hover:text-[#7b61ff] hover:bg-[#7b61ff]/5'
                                }`}
                            title="Copy response"
                        >
                            {copied ? (
                                <>
                                    <Copy size={12} className="text-[#7b61ff]" />
                                    <span>Copied</span>
                                </>
                            ) : (
                                <>
                                    <Copy size={12} />
                                    <span>Copy</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
