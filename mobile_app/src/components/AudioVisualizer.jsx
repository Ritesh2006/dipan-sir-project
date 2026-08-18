import React from 'react';

export default function AudioVisualizer({ isListening }) {
  return (
    <div className="flex items-center justify-center space-x-1.5 py-4">
      {[40, 70, 30, 90, 50, 80, 45, 65, 35, 75].map((height, idx) => (
        <div
          key={idx}
          className={`w-1.5 rounded-full transition-all duration-300 ${
            isListening
              ? 'bg-gradient-to-t from-sky-500 to-emerald-400 animate-pulse'
              : 'bg-slate-700'
          }`}
          style={{
            height: isListening ? `${Math.max(12, (height * Math.random()) + 15)}px` : '10px',
            animationDelay: `${idx * 0.1}s`
          }}
        />
      ))}
    </div>
  );
}
