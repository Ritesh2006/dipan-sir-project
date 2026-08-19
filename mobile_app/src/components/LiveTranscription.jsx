import React, { useEffect, useRef } from 'react';
import { Mic, Square, Radio, Clock, CheckCircle2, ChevronDown, Wifi, WifiOff, Trash2 } from 'lucide-react';

const ENGINE_LABELS = {
  native: 'Native STT',
  'vosk-offline': 'Vosk Offline',
  'web-speech': 'Web Speech',
  idle: 'Idle',
};

export default function LiveTranscription({
  isActive,
  phrases,
  livePartial,
  speechEngine,
  isOnline,
  loggedCount,
  onStart,
  onStop,
  onClear,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [phrases, livePartial]);

  return (
    <div className="bg-white border-2 border-violet-300 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Radio className={`w-4 h-4 text-white ${isActive ? 'animate-pulse' : 'opacity-70'}`} />
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wide">Live Transcription</h3>
            <p className="text-[10px] text-violet-200 font-bold">
              {isActive ? 'Listening continuously...' : 'Tap to start live mode'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[9px] font-black text-violet-200 bg-violet-800/50 px-1.5 py-0.5 rounded-full">
            {ENGINE_LABELS[speechEngine] || speechEngine}
          </span>
          {isOnline ? (
            <Wifi className="w-3 h-3 text-emerald-300" />
          ) : (
            <WifiOff className="w-3 h-3 text-rose-300" />
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-violet-50 px-4 py-2 flex items-center justify-between border-b border-violet-200">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3 text-violet-600" />
            <span className="text-[10px] font-black text-violet-800">
              {loggedCount} phrase{loggedCount !== 1 ? 's' : ''} logged
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-500">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-1.5">
          {phrases.length > 0 && (
            <button onClick={onClear} className="text-[10px] font-bold text-rose-500 hover:text-rose-700 px-1.5 py-0.5 rounded hover:bg-rose-50">
              Clear
            </button>
          )}
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
            isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {isOnline ? 'AUTO-SYNC' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Phrase List */}
      <div ref={scrollRef} className="max-h-52 overflow-y-auto px-4 py-2 space-y-1.5">
        {phrases.length === 0 && !livePartial && (
          <div className="text-center py-6">
            <Mic className="w-6 h-6 text-violet-300 mx-auto mb-2" />
            <p className="text-[11px] text-slate-400 font-bold">
              {isActive ? 'Listening... Speak to auto-log phrases' : 'Tap the button below to start live mode'}
            </p>
          </div>
        )}

        {phrases.map((phrase, idx) => (
          <div
            key={phrase.id || idx}
            className="bg-violet-50/80 border border-violet-200 rounded-xl px-3 py-2 animate-slide-up"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-black text-violet-500">
                #{idx + 1} &middot; {phrase.submissionId}
              </span>
              <span className="text-[9px] font-bold text-slate-400">
                {phrase.timestamp ? new Date(phrase.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
              </span>
            </div>
            <p className="text-[11px] text-slate-800 font-semibold leading-relaxed">
              {phrase.transcript}
            </p>
          </div>
        ))}

        {livePartial && (
          <div className="bg-emerald-50/80 border border-emerald-300 border-dashed rounded-xl px-3 py-2">
            <div className="flex items-center space-x-1 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] font-black text-emerald-600">LIVE</span>
            </div>
            <p className="text-[11px] text-emerald-800 font-semibold italic leading-relaxed">
              {livePartial}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-center space-x-4">
        {!isActive ? (
          <button
            onClick={onStart}
            className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-xs font-black rounded-xl shadow-lg shadow-violet-500/20 active:scale-95 transition-all"
          >
            <Mic className="w-4 h-4" />
            <span>START LIVE MODE</span>
          </button>
        ) : (
          <button
            onClick={onStop}
            className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-black rounded-xl shadow-lg shadow-rose-500/20 animate-pulse active:scale-95 transition-all"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>STOP LIVE MODE</span>
          </button>
        )}
      </div>
    </div>
  );
}
