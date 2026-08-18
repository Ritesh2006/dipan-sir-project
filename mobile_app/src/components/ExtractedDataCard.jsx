import React from 'react';
import { Cpu, CheckCircle2 } from 'lucide-react';

export default function ExtractedDataCard({ extractedData }) {
  const keys = Object.keys(extractedData || {});

  return (
    <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/80 rounded-2xl p-4 shadow-xl">
      <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs mb-3">
        <Cpu className="w-4 h-4" />
        <span>EXTRACTED INFORMATION</span>
      </div>

      {keys.length > 0 ? (
        <div className="grid grid-cols-2 gap-2.5">
          {keys.map((key) => (
            <div key={key} className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-2.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">{key}</span>
              <span className="text-sm font-bold text-slate-100 mt-0.5 block truncate">
                {String(extractedData[key])}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-4 text-center">
          <p className="text-xs text-slate-500 italic">No structured data parsed yet.</p>
        </div>
      )}
    </div>
  );
}
