import React from 'react';
import { Trash2, FileSpreadsheet, CheckCircle2, Clock, RefreshCw, Database } from 'lucide-react';

export default function HistoryTable({ records, onClear, sheetRows, sheetFilter, onFilterChange, onRefreshSheet }) {
  return (
    <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2 text-emerald-950 font-bold text-xs">
          <Database className="w-4 h-4 text-emerald-600" />
          <span>OFFLINE SHEET ({records.length} rows)</span>
        </div>
        <div className="flex items-center space-x-1">
          {onRefreshSheet && (
            <button onClick={onRefreshSheet} className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          {records.length > 0 && (
            <button onClick={onClear} className="text-xs text-rose-600 hover:text-rose-700 flex items-center space-x-1 font-bold">
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {onFilterChange && (
        <div className="flex space-x-1 mb-3 bg-slate-50 border border-slate-200 p-1 rounded-xl">
          {['ALL', 'STALL', 'SCIENCE', 'LECTURE'].map(tab => (
            <button
              key={tab}
              onClick={() => onFilterChange(tab)}
              className={`flex-1 py-1 rounded-lg text-[10px] font-black transition-all ${sheetFilter === tab ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {records.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-emerald-200 text-emerald-900 font-extrabold uppercase text-[10px]">
                <th className="py-2 px-2">ID</th>
                <th className="py-2 px-2">Name</th>
                <th className="py-2 px-2">Tab</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2">Transcript</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100 text-slate-800">
              {records.map((rec, i) => (
                <tr key={rec.id || i} className="hover:bg-emerald-50/50">
                  <td className="py-2.5 px-2 font-black text-emerald-950">{rec["Submission ID"] || rec.submissionId || `SUB-${i+1}`}</td>
                  <td className="py-2.5 px-2 font-bold text-slate-900 truncate max-w-[100px]">
                    {rec["Stall Name"] || rec["Exhibit/Project Name"] || rec["Lecture Title"] || rec.name || "Submission"}
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold border ${(rec._activeTab || rec.tab) === 'SCIENCE' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : (rec._activeTab || rec.tab) === 'LECTURE' ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-orange-100 text-orange-700 border-orange-300'}`}>
                      {rec._activeTab || rec.tab || 'STALL'}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    {(rec.syncStatus === 'VERIFIED_AND_SYNCED' || rec.syncStatus === 'SYNCED') ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center space-x-1">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                        <span>Synced</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center space-x-1">
                        <Clock className="w-2.5 h-2.5 text-amber-600" />
                        <span>Pending</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-slate-600 text-[11px] truncate max-w-[120px]">
                    {rec["Transcript"] || rec.transcript || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-6 text-center text-emerald-800/70 text-xs italic font-semibold">
          No records yet. Submit an entry to start your offline sheet!
        </div>
      )}
    </div>
  );
}
