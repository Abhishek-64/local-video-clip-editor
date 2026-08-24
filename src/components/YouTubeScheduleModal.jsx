import React, { useState, useEffect } from 'react';
import {
  Youtube, Calendar, Clock, X, Sparkles, Send, Globe, Lock, EyeOff,
  Tag, Plus, Trash2, CheckCircle2, ChevronRight, AlertCircle, Film
} from 'lucide-react';
import { formatTime } from '../utils/time';

/**
 * Format Date to local ISO string format suitable for datetime-local input: YYYY-MM-DDTHH:mm
 */
function toDateTimeLocalString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function YouTubeScheduleModal({
  isOpen,
  onClose,
  clip,               // single clip object or array of clips for batch
  ytSettings = {},
  movieName = 'Movie',
  onConfirmUpload,
  isBatch = false
}) {
  if (!isOpen || !clip) return null;

  // Initial title & description defaults
  const clipPartNumber = clip.partNumber || 1;
  const initialTitle = clip.partTitle
    ? `${movieName} - ${clip.partTitle} | Part ${clipPartNumber} #Shorts`
    : clip.name ? clip.name.replace(/\.[^/.]+$/, '') : `${movieName} - Part ${clipPartNumber} #Shorts`;

  const [scheduleType, setScheduleType] = useState('schedule'); // 'schedule' | 'immediate'
  
  // Default scheduled time: clip.scheduledAt if available, otherwise Tomorrow at 18:00 (6 PM)
  const defaultDate = clip.scheduledAt ? new Date(clip.scheduledAt) : (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(18, 0, 0, 0);
    return d;
  })();

  const [scheduledDateTime, setScheduledDateTime] = useState(toDateTimeLocalString(defaultDate));
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(
    ytSettings.yt_description_template
      ? ytSettings.yt_description_template
          .replace(/\{movie\}/g, movieName)
          .replace(/\{part\}/g, String(clipPartNumber).padStart(2, '0'))
      : `${movieName} - Part ${clipPartNumber}\n\nProcessed with Local Video Clipper\n#Shorts #Clips`
  );
  const [visibility, setVisibility] = useState(ytSettings.yt_visibility || 'public');
  const [tags, setTags] = useState(ytSettings.yt_tags || ['shorts', 'clips', 'movie']);
  const [tagInput, setTagInput] = useState('');
  const [madeForKids, setMadeForKids] = useState(Boolean(ytSettings.yt_made_for_kids));

  // Quick Schedule Presets
  const applyPreset = (preset) => {
    const d = new Date();
    switch (preset) {
      case 'plus1hour':
        d.setHours(d.getHours() + 1);
        break;
      case 'tonight':
        d.setHours(20, 0, 0, 0);
        if (d <= new Date()) d.setDate(d.getDate() + 1);
        break;
      case 'tomorrow':
        d.setDate(d.getDate() + 1);
        d.setHours(18, 0, 0, 0);
        break;
      case 'in2days':
        d.setDate(d.getDate() + 2);
        d.setHours(18, 0, 0, 0);
        break;
      case 'in3days':
        d.setDate(d.getDate() + 3);
        d.setHours(18, 0, 0, 0);
        break;
      case 'nextweek':
        d.setDate(d.getDate() + 7);
        d.setHours(18, 0, 0, 0);
        break;
      default:
        break;
    }
    setScheduledDateTime(toDateTimeLocalString(d));
    setScheduleType('schedule');
  };

  const handleAddTag = () => {
    const clean = tagInput.trim().toLowerCase().replace(/^#+/, '');
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleUploadSubmit = () => {
    let scheduledAtIso = null;

    if (scheduleType === 'schedule') {
      const selected = new Date(scheduledDateTime);
      if (selected <= new Date()) {
        alert('Please choose a future date and time for scheduled publishing.');
        return;
      }
      scheduledAtIso = selected.toISOString();
    }

    onConfirmUpload(clip, {
      titleOverride: title.trim() || initialTitle,
      descriptionOverride: description.trim(),
      tagsOverride: tags,
      visibilityOverride: scheduleType === 'schedule' ? 'private' : visibility,
      scheduledAt: scheduledAtIso,
      madeForKids
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl animate-scaleUp max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
              <Youtube className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center space-x-1.5">
                <span>YouTube Upload &amp; Schedule</span>
                <span className="text-[10px] uppercase font-bold bg-red-500/20 text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded-full">
                  Part {clipPartNumber}
                </span>
              </h3>
              <p className="text-xs text-slate-400 truncate max-w-xs sm:max-w-sm">
                {clip.name} &bull; {formatTime(clip.duration || (clip.endTime - clip.startTime) || 0)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* 1. Schedule Timing Selector */}
          <div className="space-y-3 bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Publish Timing</span>
              </div>

              {/* Mode Switcher */}
              <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-xs">
                <button
                  onClick={() => setScheduleType('schedule')}
                  className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    scheduleType === 'schedule'
                      ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Schedule Date &amp; Time
                </button>
                <button
                  onClick={() => setScheduleType('immediate')}
                  className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    scheduleType === 'immediate'
                      ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Publish Now
                </button>
              </div>
            </div>

            {scheduleType === 'schedule' ? (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1.5">
                    Select Manual Publish Date &amp; Time:
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-orange-500 text-white text-xs font-mono px-3.5 py-2.5 rounded-xl outline-none"
                  />
                </div>

                {/* Quick Date Presets */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase">Quick Schedule Presets:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'plus1hour', label: '+1 Hour' },
                      { id: 'tonight', label: 'Tonight (8 PM)' },
                      { id: 'tomorrow', label: 'Tomorrow (6 PM)' },
                      { id: 'in2days', label: 'In 2 Days' },
                      { id: 'in3days', label: 'In 3 Days' },
                      { id: 'nextweek', label: 'Next Week' }
                    ].map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p.id)}
                        className="px-2.5 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 rounded-lg transition-colors cursor-pointer touch-manipulation"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-purple-400/90 flex items-center space-x-1 pt-1">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span>YouTube will keep the video private until this exact scheduled time, then release it automatically.</span>
                </p>
              </div>
            ) : (
              <div className="pt-2">
                <label className="text-[11px] font-medium text-slate-400 block mb-1.5">Visibility Status:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'public', label: 'Public', icon: Globe, desc: 'Anyone can see' },
                    { id: 'unlisted', label: 'Unlisted', icon: EyeOff, desc: 'Anyone with link' },
                    { id: 'private', label: 'Private', icon: Lock, desc: 'Only you' }
                  ].map(v => {
                    const Icon = v.icon;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVisibility(v.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          visibility === v.id
                            ? 'bg-orange-500/15 border-orange-500 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center space-x-1.5 mb-1 font-semibold text-xs text-white">
                          <Icon className="w-3.5 h-3.5 text-orange-400" />
                          <span>{v.label}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 leading-tight block">{v.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 2. Video Title & Metadata */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-white block mb-1.5">
                Video Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title on YouTube..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 text-white text-xs px-3.5 py-2.5 rounded-xl outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-white block mb-1.5">
                Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description & hashtags..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 text-white text-xs p-3 rounded-xl outline-none resize-none font-mono"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs font-bold text-white block mb-1.5">
                Tags &amp; Hashtags
              </label>
              <div className="flex items-center space-x-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Add tag and press Enter..."
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-orange-500 text-white text-xs px-3 py-2 rounded-xl outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => (
                  <span
                    key={t}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] bg-slate-950 border border-slate-800 text-slate-300"
                  >
                    <span>#{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="text-slate-500 hover:text-rose-400 cursor-pointer ml-1"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={handleUploadSubmit}
            className="flex-1 sm:flex-none px-6 py-2.5 bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 hover:from-red-500 hover:to-amber-400 active:scale-98 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>
              {scheduleType === 'schedule' ? 'Queue Scheduled Upload' : 'Upload Video to YouTube'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
