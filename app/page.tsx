'use client';

import { useChat } from 'ai/react';
import { useRef, useEffect, useState } from 'react';
import qaData from '../data/hms-dexter-qa.json';

export default function Chat() {
    const { messages, input, handleInputChange, handleSubmit, isLoading, append } = useChat();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);

    // Load 4 random questions on mount
    useEffect(() => {
        const shuffled = [...qaData].sort(() => 0.5 - Math.random());
        setSuggestedQuestions(shuffled.slice(0, 4).map((item: any) => item.question));
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex flex-col min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-orange-500/30">

            {/* Header */}
            <header className="bg-neutral-900/80 backdrop-blur-md border-b border-neutral-800 p-4 sticky top-0 z-10 shadow-lg">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-xl shadow-[0_0_20px_rgba(234,88,12,0.4)] ring-2 ring-orange-500/20">
                            📡
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-white leading-tight">Dexter Tech Support <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">AI</span></h1>
                            <p className="text-xs text-neutral-400 font-medium">Powered by SEPLE</p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Chat Area */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="max-w-3xl mx-auto space-y-6">

                    {/* Empty State */}
                    {messages.length === 0 ? (
                        <div className="text-center mt-24 p-10 rounded-3xl bg-neutral-900/50 border border-neutral-800/80 backdrop-blur-sm shadow-xl">
                            <div className="text-6xl mb-6">👋</div>
                            <h2 className="text-2xl font-semibold mb-3 text-white">Ask me about the HMS Panel!</h2>
                            <p className="text-neutral-400 max-w-sm mx-auto leading-relaxed">
                                I am a secure, locally-hosted RAG agent. I strictly answer questions based on the vectorized knowledge base.
                            </p>

                            <div className="mt-8 grid gap-3 sm:grid-cols-2 text-sm">
                                {suggestedQuestions.map((question, i) => (
                                    <button
                                        key={i}
                                        onClick={() => append({ role: 'user', content: question })}
                                        className="p-4 rounded-2xl bg-neutral-800/50 border border-neutral-700/50 text-neutral-300 text-left cursor-pointer hover:bg-neutral-800 hover:border-orange-500/50 hover:text-orange-400 transition-all shadow-sm"
                                    >
                                        "{question}"
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        // Messages List
                        messages.map((m) => (
                            <div
                                key={m.id}
                                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                            >
                                <div
                                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 sm:p-5 shadow-sm ${m.role === 'user'
                                        ? 'bg-gradient-to-br from-orange-600 to-amber-600 text-white rounded-tr-none shadow-orange-900/20'
                                        : 'bg-neutral-900 text-neutral-200 rounded-tl-none border border-neutral-800 shadow-xl'
                                        }`}
                                >
                                    {m.role !== 'user' && (
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center text-[10px]">🤖</div>
                                            <div className="text-xs text-orange-400/90 font-bold tracking-wide uppercase">Support AI</div>
                                        </div>
                                    )}
                                    <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{m.content}</p>
                                </div>
                            </div>
                        ))
                    )}

                    {/* Loading Indicator */}
                    {isLoading && messages[messages.length - 1]?.role === 'user' && (
                        <div className="flex justify-start animate-in fade-in duration-300">
                            <div className="flex items-center gap-2 px-2 py-1">
                                <span className="text-xs text-orange-400/90 font-medium tracking-wide">typing</span>
                                <div className="flex gap-1 items-center mb-[2px]">
                                    <div className="w-1 h-1 rounded-full bg-orange-500/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1 h-1 rounded-full bg-orange-500/80 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1 h-1 rounded-full bg-orange-500/80 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Invisible Spacer to pad bottom of chat so it clears the fixed input overlay */}
                    <div ref={messagesEndRef} className="h-24 sm:h-28 flex-shrink-0" />
                </div>
            </main>

            {/* Input Form overlay */}
            <div className="fixed bottom-0 w-full bg-gradient-to-t from-neutral-950 via-neutral-950/90 to-transparent pt-32 pb-6 px-4 pointer-events-none">
                <div className="max-w-3xl mx-auto pointer-events-auto">
                    <form onSubmit={handleSubmit} className="relative flex items-center group">
                        <input
                            className="w-full bg-neutral-900 border border-neutral-700/80 p-4 pl-6 pr-14 rounded-full shadow-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all text-white placeholder-neutral-500 text-[15px]"
                            value={input}
                            placeholder="Ask a technical support question..."
                            onChange={handleInputChange}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="absolute right-2 p-2.5 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-full hover:from-orange-500 hover:to-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 translate-x-[1px] -translate-y-[1px]">
                                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                            </svg>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
