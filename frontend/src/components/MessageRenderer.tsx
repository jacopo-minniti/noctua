import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Link, File, Globe, Image as ImageIcon, Bot, Circle, PlayCircle } from "lucide-react";

interface Message {
    role: "user" | "assistant";
    content: string;
}

interface MessageRendererProps {
    msg: Message;
}

export default function MessageRenderer({ msg }: MessageRendererProps) {
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

    return (
        <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} group items-start gap-3`}>
            {!isUser && (
                <div className="w-8 h-8 rounded-full border border-[var(--notion-border)] flex items-center justify-center bg-[var(--background)] mt-1 flex-shrink-0">
                    <Bot size={16} className="text-[var(--notion-text-light)]" />
                </div>
            )}
            <div
                className={`${isUser ? 'px-5 py-3' : 'px-0 py-2'} max-w-[85%] rounded-2xl ${isUser
                    ? 'bg-[#7b61ff]/10 text-[#7b61ff] dark:bg-[#7b61ff]/20 dark:text-[#a08cff] shadow-sm'
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
                <div className={`leading-loose prose prose-sm md:prose-base max-w-none prose-p:mb-5 prose-headings:mt-6 prose-headings:mb-4 prose-hr:my-8 ${isUser ? 'prose-purple' : ''} ${isToolCall || isReasoning ? 'text-[var(--notion-text-light)] pl-6 text-sm' : ''}`}>
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                            a: ({ node, ...props }) => {
                                const isVaultNote = props.href?.startsWith("obsidian://") || props.href?.includes(".md") || props.children?.toString().includes("vault note:");
                                const isWebSource = props.href?.startsWith("http");

                                // Parse [vault note: ...] implicitly from agent without manual wrapper
                                if (typeof props.children === 'string' && props.children.startsWith("vault note:")) {
                                    const text = props.children.replace("vault note:", "").trim();
                                    const parts = text.split(">");
                                    const filename = parts[0].trim();
                                    const header = parts.length > 1 ? `#${parts[1].trim()}` : "";
                                    return (
                                        <a href={`obsidian://open?vault=${encodeURIComponent("Jacopo's Vault")}&file=${encodeURIComponent(filename)}${encodeURIComponent(header)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline transition-all text-[#7b61ff] dark:text-[#a08cff] font-medium border-b border-[#7b61ff]/30 pb-0.5">
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
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 hover:underline transition-all border-b pb-0.5 text-[#7b61ff] dark:text-[#a08cff] font-medium border-[#7b61ff]/30"
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
                                        {isWebSource && <img src="/web-sources-icon.png" alt="Web" className="w-4 h-4 inline mb-0.5 object-contain" />}
                                        {props.children}
                                    </a>
                                );
                            },
                            p: ({ node, ...props }) => <p className="mb-4 last:mb-0 leading-loose" {...props} />,
                            h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-8 mb-4 tracking-tight" {...props} />,
                            h2: ({ node, ...props }) => <h2 className="text-xl font-semibold mt-6 mb-3 tracking-snug" {...props} />,
                            h3: ({ node, ...props }) => <h3 className="text-lg font-medium mt-5 mb-2" {...props} />,
                            hr: ({ node, ...props }) => <hr className="my-8 border-t-2 border-[var(--notion-border)]" {...props} />,
                            ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
                            ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
                            li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                            code: ({ node, inline, className, children, ...props }: any) => {
                                const match = /language-(\w+)/.exec(className || '');
                                if (inline) {
                                    return <code className="bg-[var(--notion-hover)] text-[#eb5757] font-mono text-sm px-1.5 py-0.5 rounded" {...props}>{children}</code>
                                }
                                const lang = match && match[1] ? match[1] : 'text';
                                return (
                                    <div className="my-5 rounded-xl overflow-hidden shadow-sm bg-[#1e1e1e] inline-block min-w-[70%] max-w-full">
                                        <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-[#333]">
                                            <span className="text-xs font-semibold text-gray-300 capitalize tracking-wider">{lang === 'text' ? 'Code' : lang}</span>
                                            <button
                                                onClick={() => navigator.clipboard.writeText(String(children).replace(/\n$/, ''))}
                                                className="text-gray-400 hover:text-white transition-colors"
                                                title="Copy to clipboard"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                            </button>
                                        </div>
                                        <div className="p-4 overflow-x-auto">
                                            <code className="text-[13px] leading-relaxed font-mono text-gray-200" {...props}>
                                                {children}
                                            </code>
                                        </div>
                                    </div>
                                );
                            },
                            pre: ({ node, ...props }: any) => {
                                const { ref, ...rest } = props;
                                return <div className="my-0" {...rest} />;
                            },
                            blockquote: ({ node, ...props }) => <blockquote className="border-l-3 border-[var(--notion-border)] pl-4 italic text-[var(--notion-text-light)] my-4" {...props} />
                        }}
                    >
                        {contentToRender}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    );
}
