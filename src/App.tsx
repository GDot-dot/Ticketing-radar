import { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Search, Ticket, Calendar, ExternalLink, Loader2, AlertCircle, Music, Star, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface EventResult {
  eventName: string;
  date: string;
  platform: string;
  url: string;
  status: string;
}

function EventCard({ result, index, isStarred, onToggleStar }: { result: EventResult, index: number, isStarred: boolean, onToggleStar: (event: EventResult, e: React.MouseEvent) => void }) {
  return (
    <motion.a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className="group block bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-xl hover:border-indigo-300 transition-all duration-300 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="flex justify-between items-start mb-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
          <Ticket size={14} />
          {result.platform}
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            result.status.includes('售完') ? 'bg-slate-100 text-slate-600' :
            result.status.includes('熱賣') || result.status.includes('開賣') ? 'bg-emerald-50 text-emerald-700' :
            'bg-amber-50 text-amber-700'
          }`}>
            {result.status}
          </span>
          <button 
            onClick={(e) => onToggleStar(result, e)}
            className="p-1.5 rounded-full hover:bg-slate-100 transition-colors z-10"
            title={isStarred ? "取消關注" : "加入關注"}
          >
            <Star size={18} className={isStarred ? "fill-amber-400 text-amber-400" : "text-slate-400 hover:text-amber-400"} />
          </button>
        </div>
      </div>
      
      <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug pr-8">
        {result.eventName}
      </h3>
      
      <div className="flex items-center gap-2 text-slate-500 text-sm mb-6">
        <Calendar size={16} className="text-slate-400" />
        <span>{result.date}</span>
      </div>
      
      <div className="flex items-center text-indigo-600 font-medium text-sm group-hover:translate-x-1 transition-transform">
        前往售票頁面 <ExternalLink size={16} className="ml-1" />
      </div>
    </motion.a>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EventResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starredEvents, setStarredEvents] = useState<EventResult[]>(() => {
    const saved = localStorage.getItem('starredEvents');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('starredEvents', JSON.stringify(starredEvents));
  }, [starredEvents]);

  const toggleStar = (event: EventResult, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setStarredEvents(prev => {
      const isStarred = prev.some(e => e.url === event.url);
      if (isStarred) {
        return prev.filter(e => e.url !== event.url);
      } else {
        return [...prev, event];
      }
    });
  };

  const isStarred = (url: string) => starredEvents.some(e => e.url === url);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setHasSearched(true);
    setError(null);
    setResults([]);

    try {
      const prompt = `
        請幫我搜尋關於「${query}」的最新演唱會、展演或見面會門票資訊。
        請特別針對台灣的各大售票平台進行搜尋，例如：KKTIX、拓元 (tixCraft)、ibon售票系統、FamiTicket 全網購票網、Ticket Plus 遠大售票、寬宏售票、年代售票等。

        請提供以下資訊，並以 JSON 格式回傳，包含一個陣列：
        - eventName: 活動名稱
        - date: 活動日期或期間 (若無確切日期請填寫 "近期" 或 "未定")
        - platform: 售票平台名稱 (例如 KKTIX, 拓元)
        - url: 該活動的直接購票連結或相關資訊頁面連結
        - status: 售票狀態 (例如：熱賣中、已售完、即將開賣、準備中)

        如果找不到任何相關的展演活動，請回傳空陣列 []。
        請確保連結 (url) 是真實有效的。
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                eventName: { type: Type.STRING },
                date: { type: Type.STRING },
                platform: { type: Type.STRING },
                url: { type: Type.STRING },
                status: { type: Type.STRING },
              },
              required: ['eventName', 'platform', 'url', 'date', 'status'],
            },
          },
        },
      });

      const text = response.text;
      if (text) {
        const parsedResults = JSON.parse(text) as EventResult[];
        setResults(parsedResults);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('搜尋過程中發生錯誤，請稍後再試。');
    } finally {
      setIsLoading(false);
    }
  };

  const resetSearch = () => {
    setHasSearched(false);
    setQuery('');
    setResults([]);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-200">
      {/* Header / Hero */}
      <div 
        className={`transition-all duration-700 ease-in-out flex flex-col items-center justify-center ${
          hasSearched ? 'pt-12 pb-8' : (starredEvents.length > 0 ? 'pt-20 pb-12' : 'h-screen pb-20')
        }`}
      >
        <motion.div 
          layout
          className="text-center max-w-2xl w-full px-4"
        >
          <motion.div 
            layoutId="logo" 
            className="flex items-center justify-center gap-3 mb-6 cursor-pointer"
            onClick={resetSearch}
            title="回首頁"
          >
            <div className="bg-indigo-600 text-white p-3 rounded-2xl shadow-lg shadow-indigo-200">
              <Ticket size={32} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">
              展演售票雷達
            </h1>
          </motion.div>
          
          {!hasSearched && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-slate-500 mb-10 text-lg"
            >
              一鍵搜尋 KKTIX、拓元、ibon 等各大平台的最新演唱會與展演門票
            </motion.p>
          )}

          <motion.form 
            layoutId="search-bar"
            onSubmit={handleSearch}
            className="relative flex items-center w-full max-w-xl mx-auto group"
          >
            <div className="absolute left-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
              <Search size={22} />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋歌手、樂團或展演名稱 (例如：蔡依林)"
              className="w-full pl-14 pr-32 py-4 rounded-full border-2 border-slate-200 bg-white text-lg focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all shadow-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-28 p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="absolute right-2 top-2 bottom-2 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : '搜尋'}
            </button>
          </motion.form>
        </motion.div>
      </div>

      {/* Starred Events Section (Home Page) */}
      <AnimatePresence>
        {!hasSearched && starredEvents.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl mx-auto px-4 pb-24 w-full"
          >
            <div className="flex items-center gap-2 mb-6 text-slate-800 px-2">
              <Star className="fill-amber-400 text-amber-400" size={24} />
              <h2 className="text-2xl font-bold">特別關注展演</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {starredEvents.map((result, index) => (
                <EventCard 
                  key={`starred-${result.url}`} 
                  result={result} 
                  index={index} 
                  isStarred={true} 
                  onToggleStar={toggleStar} 
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results Section */}
      <AnimatePresence>
        {hasSearched && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto px-4 pb-24 w-full"
          >
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Loader2 size={48} className="animate-spin mb-4 text-indigo-500" />
                <p className="text-lg animate-pulse">正在為您跨平台搜尋最新票務資訊...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 text-red-600 p-6 rounded-2xl flex items-center gap-3 justify-center shadow-sm border border-red-100">
                <AlertCircle size={24} />
                <p className="font-medium">{error}</p>
              </div>
            ) : results.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-6 px-2">
                  <h2 className="text-xl font-bold text-slate-800">搜尋結果</h2>
                  <span className="text-sm text-slate-500">找到 {results.length} 筆相關資訊</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {results.map((result, index) => (
                    <EventCard 
                      key={`result-${result.url}`} 
                      result={result} 
                      index={index} 
                      isStarred={isStarred(result.url)} 
                      onToggleStar={toggleStar} 
                    />
                  ))}
                </div>
              </>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed"
              >
                <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Music size={32} className="text-slate-400" />
                </div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">目前沒有找到相關展演</h3>
                <p className="text-slate-500">試試看搜尋其他歌手或活動名稱吧！</p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
