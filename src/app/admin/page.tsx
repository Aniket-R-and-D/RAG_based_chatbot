'use client';

import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faLock, faGear, faArrowLeft, faPenToSquare, faChartLine,
    faCircleCheck, faRocket, faComment, faBook, faRobot,
    faCircleExclamation, faCubes, faFire, faClock, faUsers,
    faPhone, faEnvelope,
} from '@fortawesome/free-solid-svg-icons';

type UnknownQuestion = { id: string; user_question: string; english_text: string; top_similarity: number; frequency: number; status: string; created_at: string; };
type Analytics = { totalChats: number; ragCount: number; generalCount: number; ragPercent: number; unknownQuestions: { total: number; pending: number; reviewed: number }; topUnknown: { english_text: string; user_question: string; frequency: number; top_similarity: number }[]; knowledgeBase: Record<string, { count: number; name: string }>; recentSessions: { user_question: string; answer_mode: string; top_similarity: number; created_at: string }[]; };
type TrackedUser = { id: string; name: string; phone: string; email: string; created_at: string; queryCount: number; lastActive: string; };

export default function AdminDashboard() {
    const [tab, setTab] = useState<'review' | 'analytics' | 'users'>('review');
    const [questions, setQuestions] = useState<UnknownQuestion[]>([]);
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [users, setUsers] = useState<TrackedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [answerText, setAnswerText] = useState('');
    const [category, setCategory] = useState('');
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');

    useEffect(() => { if (typeof window !== 'undefined' && sessionStorage.getItem('adminAuth') === 'true') setIsAuthenticated(true); }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // Use environment variable for admin password, fallback strictly for local dev if missing
        const validPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'local_admin_only_123';

        if (passwordInput === validPassword) {
            setIsAuthenticated(true);
            sessionStorage.setItem('adminAuth', 'true');
        } else {
            setAuthError('Incorrect password');
        }
    };

    const fetchQuestions = useCallback(async () => { setLoading(true); const res = await fetch('/api/admin/questions?status=pending'); const data = await res.json(); setQuestions(data.questions || []); setLoading(false); }, []);
    const fetchAnalytics = useCallback(async () => { setLoading(true); const res = await fetch('/api/admin/analytics'); const data = await res.json(); setAnalytics(data); setLoading(false); }, []);
    const fetchUsers = useCallback(async () => { setLoading(true); const res = await fetch('/api/users'); const data = await res.json(); setUsers(data.users || []); setLoading(false); }, []);

    useEffect(() => { if (tab === 'review') fetchQuestions(); else if (tab === 'analytics') fetchAnalytics(); else fetchUsers(); }, [tab, fetchQuestions, fetchAnalytics, fetchUsers]);

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    const handleSaveAndTrain = async (q: UnknownQuestion) => {
        if (!answerText.trim()) return; setSaving(true);
        try {
            const res = await fetch('/api/admin/seed-answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: q.id, answer: answerText, category: category || 'general', englishQuestion: q.english_text }) });
            const data = await res.json();
            if (data.success) { showToast('Bot trained!'); setExpandedId(null); setAnswerText(''); setCategory(''); fetchQuestions(); }
            else showToast(`Error: ${data.error}`);
        } catch { showToast('Network error'); }
        setSaving(false);
    };

    const handleDismiss = async (id: string) => {
        await fetch('/api/admin/questions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'dismissed' }) });
        fetchQuestions(); showToast('Dismissed');
    };

    // ─── Login ─────────────────────────────────────
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4">
                <div className="skeuo-card p-6 sm:p-8 max-w-sm w-full space-y-5 animate-fade-up">
                    <div className="text-center">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl skeuo-leather mx-auto flex items-center justify-center mb-3 sm:mb-4">
                            <FontAwesomeIcon icon={faLock} className="w-5 h-5 text-[#CA8A04]" />
                        </div>
                        <h2 className="text-lg sm:text-xl font-semibold text-[#1C1917] tracking-tight">Admin Access</h2>
                        <p className="text-xs sm:text-sm text-[#78716C] mt-1">Enter password to continue.</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-3 sm:space-y-4">
                        <div>
                            <input type="password" value={passwordInput} onChange={(e) => { setPasswordInput(e.target.value); setAuthError(''); }} placeholder="Enter password" className="skeuo-input w-full p-2.5 sm:p-3 text-sm" />
                            {authError && <p className="text-red-600 text-xs mt-2">{authError}</p>}
                        </div>
                        <button type="submit" className="skeuo-brass w-full py-2.5 text-sm">Login</button>
                    </form>
                    <a href="/" className="flex items-center justify-center gap-1.5 text-xs text-[#78716C] hover:text-[#CA8A04] transition-colors cursor-pointer">
                        <FontAwesomeIcon icon={faArrowLeft} className="w-3 h-3" /> Back to Chat
                    </a>
                </div>
            </div>
        );
    }

    // ─── Dashboard ─────────────────────────────────
    return (
        <div className="min-h-screen">
            {toast && <div className="fixed top-4 right-4 z-50 skeuo-card text-sm px-4 py-3 animate-fade-up text-[#1C1917]">{toast}</div>}

            {/* Brushed Metal Header */}
            <header className="sticky top-0 z-20 skeuo-metal">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl skeuo-leather flex items-center justify-center shadow-md">
                            <FontAwesomeIcon icon={faGear} className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#CA8A04]" />
                        </div>
                        <div>
                            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#1C1917]">Admin <span className="text-[#CA8A04]">Dashboard</span></h1>
                            <p className="text-[10px] sm:text-[11px] text-[#78716C]">Dexter HMS Bot — Train & Monitor</p>
                        </div>
                    </div>
                    <a href="/" className="skeuo-raised flex items-center gap-1.5 text-xs text-[#44403C] px-2.5 py-1.5 sm:px-3 sm:py-2 transition-all">
                        <FontAwesomeIcon icon={faArrowLeft} className="w-3 h-3" /> <span className="hidden sm:inline">Back</span>
                    </a>
                </div>
            </header>

            {/* Tabs — raised with inset active */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-5 sm:pt-6">
                <div className="inline-flex gap-1 rounded-xl p-1.5 bg-[#F0EBE3] border border-[#D6CFC4] shadow-[inset_0_2px_4px_rgba(0,0,0,0.08)]">
                    {([
                        { key: 'review' as const, label: 'Review', icon: faPenToSquare, badge: questions.length },
                        { key: 'analytics' as const, label: 'Analytics', icon: faChartLine },
                        { key: 'users' as const, label: 'Users', icon: faUsers, badge: users.length },
                    ]).map(({ key, label, icon, badge }) => (
                        <button key={key} onClick={() => setTab(key)}
                            className={`flex items-center gap-1.5 px-3.5 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer ${tab === key
                                ? 'bg-[#FAF7F2] text-[#1C1917] shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_0_rgba(255,255,255,0.7)_inset] border border-[#D6CFC4]'
                                : 'text-[#78716C] hover:text-[#44403C]'
                                }`}>
                            <FontAwesomeIcon icon={icon} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            <span className="hidden sm:inline">{label}</span>
                            {badge !== undefined && badge > 0 && tab !== key && (
                                <span className="ml-1 bg-[#CA8A04] text-white text-[10px] px-1.5 py-0.5 rounded-full shadow-sm">{badge}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-[#CA8A04] animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 rounded-full bg-[#D97706] animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                ) : tab === 'review' ? (
                    <div className="space-y-3 sm:space-y-4">
                        {questions.length === 0 ? (
                            <div className="text-center py-16 sm:py-20 animate-fade-up">
                                <FontAwesomeIcon icon={faCircleCheck} className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-600 mb-3 sm:mb-4" />
                                <h2 className="text-lg sm:text-xl font-semibold text-[#1C1917] mb-2">All caught up!</h2>
                                <p className="text-[#78716C] text-sm">No pending questions to review.</p>
                            </div>
                        ) : questions.map((q) => (
                            <div key={q.id} className={`skeuo-card overflow-hidden ${expandedId === q.id ? 'border-[#CA8A04]/40 shadow-lg' : ''}`}>
                                <button onClick={() => { setExpandedId(expandedId === q.id ? null : q.id); setAnswerText(''); setCategory(''); }}
                                    className="w-full text-left p-4 sm:p-5 flex items-start justify-between gap-3 sm:gap-4 cursor-pointer">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[#1C1917] font-medium truncate text-sm sm:text-base">{q.english_text}</p>
                                        <p className="text-[#A8A29E] text-xs sm:text-sm mt-1 truncate">{q.user_question}</p>
                                    </div>
                                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                                        <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">{q.frequency}× asked</span>
                                        <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-[#F0EBE3] text-[#78716C] border border-[#D6CFC4] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hidden sm:inline-flex">{(q.top_similarity * 100).toFixed(0)}%</span>
                                    </div>
                                </button>
                                {expandedId === q.id && (
                                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0 border-t border-[#D6CFC4] space-y-3 sm:space-y-4">
                                        <div className="pt-3 sm:pt-4">
                                            <label className="text-[10px] sm:text-xs text-[#78716C] uppercase tracking-wider font-medium">Category</label>
                                            <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. troubleshooting, installation" className="skeuo-input mt-1 w-full p-2.5 sm:p-3 text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] sm:text-xs text-[#78716C] uppercase tracking-wider font-medium">Answer (English)</label>
                                            <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} rows={4} placeholder="Write the correct English answer." className="skeuo-input mt-1 w-full p-2.5 sm:p-3 text-sm resize-none" />
                                        </div>
                                        <div className="flex gap-2 sm:gap-3">
                                            <button onClick={() => handleSaveAndTrain(q)} disabled={saving || !answerText.trim()}
                                                className="skeuo-brass flex-1 py-2.5 px-4 text-xs sm:text-sm flex items-center justify-center gap-2">
                                                <FontAwesomeIcon icon={faRocket} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                                {saving ? 'Training...' : 'Save & Train Bot'}
                                            </button>
                                            <button onClick={() => handleDismiss(q.id)} className="skeuo-raised py-2.5 px-3 sm:px-4 text-[#78716C] text-xs sm:text-sm hover:text-red-600 transition-colors">
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : tab === 'analytics' ? (analytics && (
                    <div className="space-y-4 sm:space-y-6">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            <SkeuoStat label="Total Chats" value={analytics.totalChats} icon={faComment} />
                            <SkeuoStat label="RAG Answers" value={`${analytics.ragCount} (${analytics.ragPercent}%)`} icon={faBook} accent="text-emerald-700" />
                            <SkeuoStat label="LLM Fallback" value={analytics.generalCount} icon={faRobot} accent="text-amber-700" />
                            <SkeuoStat label="Pending" value={analytics.unknownQuestions.pending} icon={faCircleExclamation} accent="text-red-700" />
                        </div>

                        <div className="skeuo-card p-4 sm:p-5">
                            <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
                                <FontAwesomeIcon icon={faCubes} className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#CA8A04]" /> Knowledge Base
                            </h3>
                            <div className="space-y-2">
                                {Object.entries(analytics.knowledgeBase).map(([source, info]) => (
                                    <div key={source} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#F0EBE3] border border-[#D6CFC4] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${source === 'json' ? 'bg-blue-500' : source === 'pdf' ? 'bg-green-500' : 'bg-[#CA8A04]'}`} />
                                            <span className="text-xs sm:text-sm text-[#44403C]">{info.name}</span>
                                        </div>
                                        <span className="text-xs sm:text-sm text-[#78716C] font-mono">{info.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {analytics.topUnknown.length > 0 && (
                            <div className="skeuo-card p-4 sm:p-5">
                                <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
                                    <FontAwesomeIcon icon={faFire} className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-600" /> Top Unknown
                                </h3>
                                <div className="space-y-2">
                                    {analytics.topUnknown.map((q, i) => (
                                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#F0EBE3] border border-[#D6CFC4] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
                                            <p className="text-xs sm:text-sm text-[#44403C] truncate flex-1 mr-3">{q.english_text}</p>
                                            <span className="text-[10px] sm:text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200 flex-shrink-0">{q.frequency}×</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="skeuo-card p-4 sm:p-5">
                            <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
                                <FontAwesomeIcon icon={faClock} className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#0D9488]" /> Recent Sessions
                            </h3>
                            <div className="overflow-x-auto -mx-1">
                                <table className="w-full text-xs sm:text-sm min-w-[480px]">
                                    <thead><tr className="text-[#78716C] text-[10px] sm:text-xs uppercase">
                                        <th className="text-left pb-3">Question</th><th className="text-center pb-3">Mode</th><th className="text-center pb-3">Score</th><th className="text-right pb-3">Time</th>
                                    </tr></thead>
                                    <tbody className="text-[#44403C]">
                                        {analytics.recentSessions.map((s, i) => (
                                            <tr key={i} className="border-t border-[#E8E0D4]">
                                                <td className="py-2.5 pr-3 truncate max-w-[180px] sm:max-w-[250px]">{s.user_question}</td>
                                                <td className="py-2.5 text-center">
                                                    <span className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] ${s.answer_mode === 'rag'
                                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                                                        }`}>
                                                        {s.answer_mode?.toUpperCase() || '—'}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 text-center font-mono text-xs">{s.top_similarity ? `${(s.top_similarity * 100).toFixed(0)}%` : '—'}</td>
                                                <td className="py-2.5 text-right text-xs text-[#A8A29E]">{new Date(s.created_at).toLocaleTimeString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )) : (
                    /* ── Users Tab ── */
                    <div className="space-y-4 sm:space-y-6">
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            <SkeuoStat label="Total Users" value={users.length} icon={faUsers} accent="text-[#CA8A04]" />
                            <SkeuoStat label="Total Queries" value={users.reduce((sum, u) => sum + u.queryCount, 0)} icon={faComment} />
                            <SkeuoStat label="Active Today" value={users.filter(u => new Date(u.lastActive).toDateString() === new Date().toDateString()).length} icon={faClock} accent="text-emerald-700" />
                        </div>

                        <div className="skeuo-card p-4 sm:p-5">
                            <h3 className="text-xs sm:text-sm font-semibold text-[#1C1917] uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
                                <FontAwesomeIcon icon={faUsers} className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#CA8A04]" /> Registered Users
                            </h3>
                            {users.length === 0 ? (
                                <div className="text-center py-10">
                                    <FontAwesomeIcon icon={faUsers} className="w-8 h-8 text-[#A8A29E] mb-3" />
                                    <p className="text-[#78716C] text-sm">No users registered yet.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto -mx-1">
                                    <table className="w-full text-xs sm:text-sm min-w-[600px]">
                                        <thead><tr className="text-[#78716C] text-[10px] sm:text-xs uppercase">
                                            <th className="text-left pb-3">Name</th><th className="text-left pb-3">Phone</th><th className="text-left pb-3">Email</th>
                                            <th className="text-center pb-3">Queries</th><th className="text-right pb-3">Last Active</th><th className="text-right pb-3">Joined</th>
                                        </tr></thead>
                                        <tbody className="text-[#44403C]">
                                            {users.map((u) => (
                                                <tr key={u.id} className="border-t border-[#E8E0D4] hover:bg-[#F0EBE3]/60 transition-colors">
                                                    <td className="py-2.5 pr-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded-full skeuo-leather flex items-center justify-center flex-shrink-0">
                                                                <span className="text-[10px] font-bold text-[#CA8A04]">{u.name.charAt(0).toUpperCase()}</span>
                                                            </div>
                                                            <span className="font-medium text-[#1C1917]">{u.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 pr-3"><div className="flex items-center gap-1.5 text-[#78716C]"><FontAwesomeIcon icon={faPhone} className="w-2.5 h-2.5" />{u.phone}</div></td>
                                                    <td className="py-2.5 pr-3"><div className="flex items-center gap-1.5 text-[#78716C]"><FontAwesomeIcon icon={faEnvelope} className="w-2.5 h-2.5" />{u.email}</div></td>
                                                    <td className="py-2.5 text-center">
                                                        <span className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] ${u.queryCount > 0
                                                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                            : 'bg-[#F0EBE3] text-[#A8A29E] border border-[#D6CFC4]'
                                                            }`}>{u.queryCount}</span>
                                                    </td>
                                                    <td className="py-2.5 text-right text-xs text-[#A8A29E]">{new Date(u.lastActive).toLocaleDateString()}</td>
                                                    <td className="py-2.5 text-right text-xs text-[#A8A29E]">{new Date(u.created_at).toLocaleDateString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

function SkeuoStat({ label, value, icon, accent }: { label: string; value: string | number; icon: any; accent?: string }) {
    return (
        <div className="skeuo-card p-4 sm:p-5 cursor-pointer">
            <div className="text-[#A8A29E] mb-2"><FontAwesomeIcon icon={icon} className="w-4 h-4 sm:w-5 sm:h-5" /></div>
            <p className={`text-xl sm:text-2xl font-bold ${accent || 'text-[#1C1917]'}`}>{value}</p>
            <p className="text-[10px] sm:text-xs text-[#A8A29E] mt-1 uppercase tracking-wider">{label}</p>
        </div>
    );
}
