import React, { useState } from 'react';
import { Crop, Image as ImageIcon, Type, Sparkles, Volume2, SlidersHorizontal, CheckCheck, Youtube, Star } from 'lucide-react';
import CropEditor from './CropEditor';
import BackgroundEditor from './BackgroundEditor';
import TextEditor from './TextEditor';
import LogoEditor from './LogoEditor';
import EffectsPanel from './EffectsPanel';
import AudioPanel from './AudioPanel';
import ExportPanel from './ExportPanel';
import YouTubePanel from './YouTubePanel';
import BrandingPanel from './BrandingPanel';

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
  onApplyToAll,
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
  persistSettings,
  isSavingSettings,
  apiAvailable,
  isAuthenticated = false,
  onOpenAuth,
  // Branding props
  brandingPresets,
  addBrandingPreset,
  editBrandingPreset,
  removeBrandingPreset,
  isLoadingPresets
}) {
  const [activeTab, setActiveTab] = useState('crop');

  const tabs = [
    { id: 'crop', label: 'Crop & Format', icon: Crop },
    { id: 'backdrop', label: 'Backdrop & Blur', icon: ImageIcon },
    { id: 'text', label: 'Text & Parts', icon: Type },
    { id: 'logo', label: 'Logo', icon: ImageIcon },
    { id: 'effects', label: 'Effects', icon: Sparkles },
    { id: 'audio', label: 'Audio & Voice', icon: Volume2 },
    { id: 'export', label: 'Export & Quality', icon: SlidersHorizontal },
    { id: 'youtube', label: 'YouTube', icon: Youtube },
    { id: 'branding', label: 'Branding', icon: Star }
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
                className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-3.5 py-2 sm:py-2.5 text-xs font-semibold rounded-t-xl transition-all border-t border-x cursor-pointer touch-manipulation whitespace-nowrap ${
                  isActive
                    ? t.id === 'youtube'
                      ? 'bg-slate-900 border-slate-800 text-red-400 border-b-2 border-b-red-500 shadow-sm'
                      : t.id === 'branding'
                      ? 'bg-slate-900 border-slate-800 text-amber-400 border-b-2 border-b-amber-500 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-orange-400 border-b-2 border-b-orange-500 shadow-sm'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${
                  isActive
                    ? t.id === 'youtube' ? 'text-red-400' : t.id === 'branding' ? 'text-amber-400' : 'text-orange-400'
                    : 'text-slate-400'
                }`} />
                <span>{t.label}</span>
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
            persistSettings={persistSettings}
            isSavingSettings={isSavingSettings}
            apiAvailable={apiAvailable}
            isAuthenticated={isAuthenticated}
            onOpenAuth={onOpenAuth}
          />
        )}

        {activeTab === 'branding' && (
          <BrandingPanel
            brandingPresets={brandingPresets}
            addBrandingPreset={addBrandingPreset}
            editBrandingPreset={editBrandingPreset}
            removeBrandingPreset={removeBrandingPreset}
            isLoadingPresets={isLoadingPresets}
            onApplyLogo={(logoOverrides) => onLogoChange(prev => ({ ...prev, ...logoOverrides }))}
            onApplyText={(textOverrides) => onTextChange(prev => ({ ...prev, ...textOverrides }))}
            currentLogoSettings={logoSettings}
            currentTextSettings={textSettings}
            apiAvailable={apiAvailable}
          />
        )}
      </div>
    </div>
  );
}
