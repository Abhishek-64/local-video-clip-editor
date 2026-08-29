import React, { useState } from 'react';
import { Crop, Image as ImageIcon, Type, Sparkles, Volume2, SlidersHorizontal, CheckCheck, Youtube, Scissors } from 'lucide-react';
import CropEditor from './CropEditor';
import BackgroundEditor from './BackgroundEditor';
import TextEditor from './TextEditor';
import LogoEditor from './LogoEditor';
import EffectsPanel from './EffectsPanel';
import AudioPanel from './AudioPanel';
import ExportPanel from './ExportPanel';
import YouTubePanel from './YouTubePanel';
import SplitCutEditor from './SplitCutEditor';

export default function EditorTabs({
  videoData,
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
  onApplyToAll,
  // Split & Cut Section props
  customParts = [],
  onCustomPartsChange,
  currentTime = 0,
  duration = 0,
  onCurrentTimeChange,
  skipDeletedCuts = true,
  onToggleSkipDeletedCuts,
  onExportMergedCleaned,
  onExportSelectedMerge,
  onGenerateBatchKept,
  onExportSinglePart,
  movieName,
  // YouTube props
  ytAccount,
  isConnected,
  isLoadingAccount,
  accountError,
  connectYouTube,
  disconnectYouTubeAccount,
  refreshAccount,
  ytSettings,
  updateYtSettings,
  apiAvailable,
  isAuthenticated = false,
  onOpenAuth,
  pipelineStartTime,
  setPipelineStartTime
}) {
  const [activeTab, setActiveTab] = useState('split-cut');

  const cutSectionsCount = (customParts || []).filter(p => p.isDeleted).length;

  const tabs = [
    { id: 'split-cut', label: 'Split & Cut', icon: Scissors, badge: cutSectionsCount > 0 ? `${cutSectionsCount} cut` : null },
    { id: 'crop', label: 'Crop & Ratio', icon: Crop },
    { id: 'backdrop', label: 'Backdrop', icon: ImageIcon },
    { id: 'text', label: 'Text & Part #', icon: Type },
    { id: 'logo', label: 'Logo', icon: ImageIcon },
    { id: 'effects', label: 'Effects', icon: Sparkles },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'export', label: 'Export', icon: SlidersHorizontal },
    { id: 'youtube', label: 'YouTube', icon: Youtube }
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
      {/* Tab Navigation Header with Smooth Horizontal Momentum Scroll */}
      <div className="flex items-center justify-between px-2 sm:px-4 pt-2.5 sm:pt-3 border-b border-slate-800 bg-slate-950/70 overflow-x-auto no-scrollbar touch-manipulation">
        <div className="flex space-x-1 min-w-max pb-0.5">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-t-xl transition-all border-t border-x cursor-pointer touch-manipulation whitespace-nowrap ${
                  isActive
                    ? t.id === 'youtube'
                      ? 'bg-slate-900 border-slate-800 text-red-400 border-b-2 border-b-red-500 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-orange-400 border-b-2 border-b-orange-500 shadow-sm'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${
                  isActive
                    ? t.id === 'youtube' ? 'text-red-400' : 'text-orange-400'
                    : 'text-slate-400'
                }`} />
                <span>{t.label}</span>
                {t.badge && (
                  <span className="px-1.5 py-0.2 bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[9px] rounded-full font-bold">
                    {t.badge}
                  </span>
                )}
                {/* Connected indicator dot */}
                {t.id === 'youtube' && isConnected && (
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {onApplyToAll && (
          <button
            onClick={onApplyToAll}
            className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors cursor-pointer ml-2 shrink-0 touch-manipulation"
            title="Apply current preset to all queued clips"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Apply to All</span>
          </button>
        )}
      </div>

      {/* Active Tab Panel Body */}
      <div className="p-3.5 sm:p-5">
        {activeTab === 'split-cut' && (
          <SplitCutEditor
            duration={duration}
            currentTime={currentTime}
            onCurrentTimeChange={onCurrentTimeChange}
            customParts={customParts}
            onCustomPartsChange={onCustomPartsChange}
            skipDeletedCuts={skipDeletedCuts}
            onToggleSkipDeletedCuts={onToggleSkipDeletedCuts}
            onExportMergedCleaned={onExportMergedCleaned}
            onExportSelectedMerge={onExportSelectedMerge}
            onGenerateBatchKept={onGenerateBatchKept}
            onExportSinglePart={onExportSinglePart}
            movieName={movieName}
          />
        )}

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
            onNavigateTab={setActiveTab}
            ytSettings={ytSettings}
            updateYtSettings={updateYtSettings}
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
            textSettings={textSettings}
            onTextChange={onTextChange}
          />
        )}

        {activeTab === 'youtube' && (
          <YouTubePanel
            ytAccount={ytAccount}
            isConnected={isConnected}
            isLoadingAccount={isLoadingAccount}
            accountError={accountError}
            connectYouTube={connectYouTube}
            disconnectYouTubeAccount={disconnectYouTubeAccount}
            refreshAccount={refreshAccount}
            ytSettings={ytSettings}
            updateYtSettings={updateYtSettings}
            apiAvailable={apiAvailable}
            isAuthenticated={isAuthenticated}
            onOpenAuth={onOpenAuth}
            pipelineStartTime={pipelineStartTime}
            setPipelineStartTime={setPipelineStartTime}
            customParts={customParts}
            textSettings={textSettings}
          />
        )}
      </div>
    </div>
  );
}
