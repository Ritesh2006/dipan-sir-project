import React from 'react';
import { Volume2 } from 'lucide-react';

export default function TranscriptPanel({ transcript, isListening }) {
  return (
    <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/80 rounded-2xl p-4 shadow-xl">
      <div className="flex items-center space-x-2 text-sky-400 font-semibold text-xs mb-2">
        <Volume2 className="w-4 h-4" />
        <span>LIVE TRANSCRIPT</span>
      </div>
      <div className="min-h-[70px] max-h-[120px] overflow-y-auto text-sm text-slate-200 leading-relaxed font-mono">
        {transcript ? (
          <p className="text-slate-100 font-sans">"{transcript}"</p>
        ) : isListening ? (
          <p className="text-emerald-400 italic font-sans animate-pulse">Listening to microphone speech...</p>
        ) : (
          <p className="text-slate-500 italic font-sans">Tap the microphone button and speak (e.g., "Rahul roll number 25 attendance present").</p>
        )}
      </div>
    </div>
  );
}
