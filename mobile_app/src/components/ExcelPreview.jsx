import React from 'react';
import { X, CheckCircle2, Edit3, FileText, Mic, Image as ImageIcon, FileSpreadsheet } from 'lucide-react';

const DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk";

const FIELD_LABELS = {
  STALL: {
    "Submission ID": "Submission ID",
    "Timestamp": "Timestamp",
    "Stall Name": "Stall Name",
    "Stall No.": "Stall No.",
    "Organization": "Organization",
    "Category": "Category",
    "Person": "Person",
    "Designation": "Designation",
    "Transcript": "Transcript",
    "Verification Status": "Verification Status",
    "Audio Drive Link": "Audio Drive Link",
    "Image Drive Link": "Image Drive Link",
    "Brochure Drive Link": "Brochure Drive Link",
  },
  SCIENCE: {
    "Submission ID": "Submission ID",
    "Timestamp": "Timestamp",
    "Exhibit/Project Name": "Exhibit/Project Name",
    "Stall No.": "Stall No.",
    "Organization/Institution": "Organization/Institution",
    "Category": "Category",
    "Presenter": "Presenter",
    "Designation/Class": "Designation/Class",
    "Transcript": "Transcript",
    "Verification Status": "Verification Status",
    "Audio Drive Link": "Audio Drive Link",
    "Image Drive Link": "Image Drive Link",
    "Brochure Drive Link": "Brochure Drive Link",
  },
  LECTURE: {
    "Submission ID": "Submission ID",
    "Timestamp": "Timestamp",
    "Lecture Title": "Lecture Title",
    "Speaker": "Speaker",
    "Designation": "Designation",
    "Organization": "Organization",
    "Topic/Category": "Topic/Category",
    "Date/Time": "Date/Time",
    "Transcript": "Transcript",
    "Verification Status": "Verification Status",
    "Audio Drive Link": "Audio Drive Link",
    "Image Drive Link": "Image Drive Link",
    "Brochure Drive Link": "Brochure Drive Link",
  },
};

const TAB_COLORS = {
  STALL: { bg: 'bg-orange-50', border: 'border-orange-300', accent: 'text-orange-700', header: 'bg-orange-600' },
  SCIENCE: { bg: 'bg-emerald-50', border: 'border-emerald-300', accent: 'text-emerald-700', header: 'bg-emerald-600' },
  LECTURE: { bg: 'bg-sky-50', border: 'border-sky-300', accent: 'text-sky-700', header: 'bg-sky-600' },
};

export default function ExcelPreview({
  show,
  onClose,
  onSubmit,
  activeTab,
  formData,
  transcript,
  audioBlob,
  imageFile,
  imagePreview,
  brochureFile,
  subId,
  counter,
  isSubmitting,
}) {
  if (!show) return null;

  const colors = TAB_COLORS[activeTab] || TAB_COLORS.STALL;
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
  const fullText = transcript ? transcript.trim() : 'Recorded audio byte stored locally';

  const buildRowData = () => {
    const row = {};
    if (activeTab === 'STALL') {
      row["Submission ID"] = subId;
      row["Timestamp"] = timestamp;
      row["Stall Name"] = formData.stallName || `Stall ${counter}`;
      row["Stall No."] = formData.stallNo || `A-0${counter}`;
      row["Organization"] = formData.organization || 'Exhibition Organization';
      row["Category"] = formData.category || 'General';
      row["Person"] = formData.person || 'N/A';
      row["Designation"] = formData.designation || 'N/A';
    } else if (activeTab === 'SCIENCE') {
      row["Submission ID"] = subId;
      row["Timestamp"] = timestamp;
      row["Exhibit/Project Name"] = formData.exhibitName || `Project ${counter}`;
      row["Stall No."] = formData.stallNo || `S-0${counter}`;
      row["Organization/Institution"] = formData.organization || 'Science Institute';
      row["Category"] = formData.category || 'Science';
      row["Presenter"] = formData.presenter || 'N/A';
      row["Designation/Class"] = formData.designationClass || 'N/A';
    } else {
      row["Submission ID"] = subId;
      row["Timestamp"] = timestamp;
      row["Lecture Title"] = formData.lectureTitle || `Lecture ${counter}`;
      row["Speaker"] = formData.speaker || `Speaker ${counter}`;
      row["Designation"] = formData.designation || 'Speaker';
      row["Organization"] = formData.organization || 'N/A';
      row["Topic/Category"] = formData.topicCategory || 'Lecture';
      row["Date/Time"] = formData.dateTime || new Date().toLocaleDateString();
    }
    row["Transcript"] = fullText;
    row["Verification Status"] = "Saved Offline & Ready";
    row["Audio Drive Link"] = `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Audio_${subId}.mp3`;
    row["Image Drive Link"] = imageFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Photo_${subId}_${imageFile.name}` : 'N/A';
    row["Brochure Drive Link"] = brochureFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Brochure_${subId}_${brochureFile.name}` : 'N/A';
    return row;
  };

  const rowData = buildRowData();
  const fieldDefs = FIELD_LABELS[activeTab] || {};

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`w-full max-w-lg max-h-[92vh] flex flex-col ${colors.bg} rounded-t-3xl sm:rounded-3xl border-2 ${colors.border} shadow-2xl overflow-hidden animate-slide-up`}>
        {/* Header */}
        <div className={`${colors.header} text-white px-5 py-3.5 flex items-center justify-between flex-shrink-0`}>
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide">Excel Preview</h2>
              <p className="text-[10px] font-bold opacity-80">{activeTab} Data - {subId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Row counter badge */}
          <div className="flex items-center justify-between text-[10px] font-black">
            <span className={`${colors.accent}`}>Row #{counter} in sheet</span>
            <span className="text-slate-500">{timestamp}</span>
          </div>

          {/* Excel-like Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="px-3 py-1.5 text-[10px] font-black text-slate-600 uppercase tracking-wider w-[40%]">Field</th>
                  <th className="px-3 py-1.5 text-[10px] font-black text-slate-600 uppercase tracking-wider w-[60%]">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(fieldDefs).map(([key, label], idx) => {
                  const value = rowData[key] || 'N/A';
                  const isTranscript = key === 'Transcript';
                  const isLink = key.includes('Drive Link') && value !== 'N/A';
                  const isId = key === 'Submission ID';
                  const isStatus = key === 'Verification Status';

                  return (
                    <tr key={key} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className={`px-3 py-2 text-[11px] font-bold ${isId ? 'text-amber-700' : 'text-slate-600'}`}>
                        {label}
                      </td>
                      <td className={`px-3 py-2 text-[11px] leading-relaxed ${
                        isTranscript ? 'text-slate-800 font-semibold' :
                        isId ? 'font-mono font-black text-amber-800' :
                        isLink ? 'text-blue-600 underline' :
                        isStatus ? 'text-emerald-700 font-black' :
                        'text-slate-700'
                      }`}>
                        {isTranscript ? (
                          <div className="max-h-24 overflow-y-auto pr-1 whitespace-pre-wrap">{value}</div>
                        ) : isLink ? (
                          <span className="truncate block" title={value}>{value.split('?')[0]}</span>
                        ) : (
                          value
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Attachments Summary */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Attachments</h4>
            <div className="grid grid-cols-3 gap-2">
              <div className={`flex flex-col items-center p-2 rounded-lg ${audioBlob ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'}`}>
                <Mic className={`w-5 h-5 mb-1 ${audioBlob ? 'text-amber-600' : 'text-slate-300'}`} />
                <span className={`text-[10px] font-bold ${audioBlob ? 'text-amber-800' : 'text-slate-400'}`}>
                  {audioBlob ? 'Audio ✓' : 'No Audio'}
                </span>
              </div>
              <div className={`flex flex-col items-center p-2 rounded-lg ${imageFile ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'}`}>
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-5 h-5 rounded object-cover mb-1" />
                ) : (
                  <ImageIcon className={`w-5 h-5 mb-1 ${imageFile ? 'text-emerald-600' : 'text-slate-300'}`} />
                )}
                <span className={`text-[10px] font-bold ${imageFile ? 'text-emerald-800' : 'text-slate-400'}`}>
                  {imageFile ? 'Photo ✓' : 'No Photo'}
                </span>
              </div>
              <div className={`flex flex-col items-center p-2 rounded-lg ${brochureFile ? 'bg-sky-50 border border-sky-200' : 'bg-slate-50 border border-slate-200'}`}>
                <FileText className={`w-5 h-5 mb-1 ${brochureFile ? 'text-sky-600' : 'text-slate-300'}`} />
                <span className={`text-[10px] font-bold ${brochureFile ? 'text-sky-800' : 'text-slate-400'}`}>
                  {brochureFile ? 'Brochure ✓' : 'No Brochure'}
                </span>
              </div>
            </div>
          </div>

          {/* Sync Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-center">
            <p className="text-[10px] font-bold text-amber-800">
              Saved locally first. Auto-syncs to Google Drive when online.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex-shrink-0 px-4 py-3 bg-white border-t border-slate-200 flex space-x-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl flex items-center justify-center space-x-1.5 transition-all active:scale-95 disabled:opacity-50"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className={`flex-[2] py-2.5 ${colors.header} hover:opacity-90 text-white text-xs font-black rounded-xl flex items-center justify-center space-x-1.5 shadow-lg transition-all active:scale-95 disabled:opacity-50`}
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm & Save Offline</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
