import React from 'react';
import { Trash2, FileSpreadsheet, ExternalLink, CheckCircle2 } from 'lucide-react';

export default function HistoryTable({ records, onClear }) {
  return (
    <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2 text-emerald-950 font-bold text-xs">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>MASTER GOOGLE SHEET RECORDS ({records.length})</span>
        </div>
        {records.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-rose-600 hover:text-rose-700 flex items-center space-x-1 font-bold"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {records.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-emerald-200 text-emerald-900 font-extrabold uppercase text-[10px]">
                <th className="py-2 px-2">ID</th>
                <th className="py-2 px-2">Name / Title</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2">Summary / Drive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100 text-slate-800">
              {records.map((rec, i) => (
                <tr key={i} className="hover:bg-emerald-50/50">
                  <td className="py-2.5 px-2 font-black text-emerald-950">{rec["Submission ID"] || `SUB-${i+1}`}</td>
                  <td className="py-2.5 px-2 font-bold text-slate-900">
                    {rec["Stall Name"] || rec["Exhibit/Project Name"] || rec["Lecture Title"] || rec["Name"] || "Submission"}
                  </td>
                  <td className="py-2.5 px-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center space-x-1">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                      <span>{rec["Verification Status"] || rec["Status"] || "Submitted"}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-slate-600 text-[11px] truncate max-w-[130px]">
                    {rec["Summary"] || rec["Transcript"] || "Synced to Drive"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-6 text-center text-emerald-800/70 text-xs italic font-semibold">
          No records in Google Sheet yet. Every submission creates 1 row immediately.
        </div>
      )}
    </div>
  );
}
