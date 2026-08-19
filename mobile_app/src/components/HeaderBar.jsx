import React, { useState } from 'react';
import { ShieldCheck, Download, Award, CheckCircle2, Wifi, WifiOff } from 'lucide-react';

export default function HeaderBar({ status, onExportExcel, serverIp, onServerIpChange, isOnline, speechEngine }) {
  const [showIpConfig, setShowIpConfig] = useState(false);
  const [inputIp, setInputIp] = useState(serverIp || '');

  const getStatusBadge = () => {
    switch (status) {
      case 'Listening':
      case 'Listening (Native Offline)':
        return <span className="px-3 py-1 text-xs font-extrabold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">Listening</span>;
      case 'Processing':
        return <span className="px-3 py-1 text-xs font-extrabold rounded-full bg-sky-100 text-sky-800 border border-sky-300">Processing...</span>;
      case 'Saved':
      case 'Saved Offline & Ready':
      case 'Saved Offline':
        return <span className="px-3 py-1 text-xs font-extrabold rounded-full bg-emerald-600 text-white border border-emerald-700 flex items-center space-x-1 shadow-sm">
          <CheckCircle2 className="w-3 h-3 text-white" />
          <span>Saved</span>
        </span>;
      case 'Error':
        return <span className="px-3 py-1 text-xs font-extrabold rounded-full bg-rose-100 text-rose-800 border border-rose-300">Error</span>;
      default:
        return <span className="px-3 py-1 text-xs font-extrabold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Ready</span>;
    }
  };

  const handleSaveIp = (e) => {
    e.preventDefault();
    if (onServerIpChange) {
      onServerIpChange(inputIp.trim());
    }
    setShowIpConfig(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-emerald-200 px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 tracking-tight leading-none">EXHIBITION 2026</h1>
            <div className="flex items-center space-x-1 text-[10px] font-bold text-emerald-700 mt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>BYTE & REPORTING SYSTEM</span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-[9px] font-black border ${isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
          </div>
          {speechEngine && (
            <div className={`px-1.5 py-1 rounded-lg text-[9px] font-black border ${speechEngine.includes('Vosk') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : speechEngine.includes('Native') ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
              {speechEngine}
            </div>
          )}
          {getStatusBadge()}
          <button
            onClick={() => setShowIpConfig(!showIpConfig)}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center shadow-xs active:scale-95 transition-all"
            title="Configure Server IP"
          >
            <Wifi className="w-4 h-4 text-emerald-600" />
          </button>
          <button
            onClick={onExportExcel}
            className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1 shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
            title="Export to Excel"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showIpConfig && (
        <form onSubmit={handleSaveIp} className="mt-2.5 p-2 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center space-x-2 shadow-xs">
          <span className="text-[10px] font-black text-emerald-950 flex-shrink-0">SERVER:</span>
          <input
            type="text"
            value={inputIp}
            onChange={(e) => setInputIp(e.target.value)}
            placeholder="exhibition-voice-logger-backend.onrender.com"
            className="flex-1 bg-white border border-emerald-300 rounded-lg px-2 py-1 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-600"
          />
          <button type="submit" className="px-3 py-1 bg-emerald-600 text-white text-[11px] font-black rounded-lg hover:bg-emerald-700">
            Save
          </button>
        </form>
      )}
    </header>
  );
}
