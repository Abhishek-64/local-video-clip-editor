import React, { useState } from 'react';
import { Crop, Image as ImageIcon, Type, Sparkles, Volume2, SlidersHorizontal, CheckCheck } from 'lucide-react';
import CropEditor from './CropEditor';
import BackgroundEditor from './BackgroundEditor';
import TextEditor from './TextEditor';
import LogoEditor from './LogoEditor';
import EffectsPanel from './EffectsPanel';
import AudioPanel from './AudioPanel';
import ExportPanel from './ExportPanel';

export default function EditorTabs({
  cropSettings,
  onCropChange,
  onCropReset,
  bgSettings,
  onBgChange,
  textSettings,
  onTextChange,
  logoSettings,
  onLogoChange,
  effectsSettings,
  onEffectsChange,
  onEffectsReset,
  audioSettings,
  onAudioChange,
  exportSettings,
  onExportChange,
  sourceResolution,
  detectedAudio,
  detectedFps,
  detectedQuality,
  onApplyToAll
}) {
  const [activeTab, setActiveTab] = useState('crop');

  const tabs = [
    { id: 'crop', label: 'Crop & Format', icon: Crop },
    { id: 'backdrop', label: 'Backdrop & Blur', icon: ImageIcon },
    { id: 'text', label: 'Text & Parts', icon: Type },
    { id: 'logo', label: 'Logo', icon: ImageIcon },
    { id: 'effects', label: 'Effects', icon: Sparkles },
    { id: 'audio', label: 'Audio & Voice', icon: Volume2 },
    { id: 'export', label: 'Export & Quality', icon: SlidersHorizontal }
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
      {/* Tab Navigation Header */}
      <div className="flex items-center justify-between px-4 pt-3 border-b border-slate-800 bg-slate-950/60 overflow-x-auto">
        <div className="flex space-x-1 min-w-max">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center space-x-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-t border-x cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 border-slate-800 text-orange-400 border-b-2 border-b-orange-500'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-orange-400' : 'text-slate-400'}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={onApplyToAll}
          className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors cursor-pointer ml-2"
          title="Apply current preset to all queued clips"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>Apply to All</span>
        </button>
      </div>

      {/* Active Tab Panel Body */}
      <div className="p-5">
        {activeTab === 'crop' && (
          <CropEditor
            cropSettings={cropSettings}
            onChange={onCropChange}
            onReset={onCropReset}
            bgSettings={bgSettings}
            onBgChange={onBgChange}
          />
        )}

        {activeTab === 'backdrop' && (
          <BackgroundEditor
            bgSettings={bgSettings}
            onChange={onBgChange}
            cropSettings={cropSettings}
            onCropChange={onCropChange}
          />
        )}

        {activeTab === 'text' && (
          <TextEditor
            textSettings={textSettings}
            onChange={onTextChange}
          />
        )}

        {activeTab === 'logo' && (
          <LogoEditor
            logoSettings={logoSettings}
            onChange={onLogoChange}
          />
        )}

        {activeTab === 'effects' && (
          <EffectsPanel
            effectsSettings={effectsSettings}
            onChange={onEffectsChange}
            onReset={onEffectsReset}
          />
        )}

        {activeTab === 'audio' && (
          <AudioPanel
            audioSettings={audioSettings}
            onChange={onAudioChange}
            detectedAudio={detectedAudio}
          />
        )}

        {activeTab === 'export' && (
          <ExportPanel
            exportSettings={exportSettings}
            onChange={onExportChange}
            sourceResolution={sourceResolution}
            detectedQuality={detectedQuality}
            detectedFps={detectedFps}
          />
        )}
      </div>
    </div>
  );
}
