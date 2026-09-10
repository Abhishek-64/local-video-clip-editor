import React, { useState, useEffect } from 'react';
import { Crop, Image as ImageIcon, Type, Sparkles, Volume2, SlidersHorizontal, Youtube, Scissors, Share2, Instagram, Database, Layers, Clock, History, ChevronLeft, X, Maximize2, Minimize2 } from 'lucide-react';
import CropEditor from './CropEditor';
import BackgroundEditor from './BackgroundEditor';
import TextEditor from './TextEditor';
import LogoEditor from './LogoEditor';
import EffectsPanel from './EffectsPanel';
import AudioPanel from './AudioPanel';
import ExportPanel from './ExportPanel';
import YouTubePanel from './YouTubePanel';
import FacebookPanel from './FacebookPanel';
import InstagramPanel from './InstagramPanel';
import SplitCutEditor from './SplitCutEditor';
import StoragePanel from './StoragePanel';
import ScheduledVideosSection from './ScheduledVideosSection';
import SocialUploadHistorySection from './SocialUploadHistorySection';

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
  completedClips = [],
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
  setPipelineStartTime,
  // Facebook props
  fbAccount,
  availablePages = [],
  isFbConnected = false,
  isFbUserConnected = false,
  isFbPageConnected = false,
  isLoadingFbAccount = false,
  fbAccountError = null,
  connectFacebook,
  connectFbPageById,
  isConnectingFbPage = false,
  fbPageConnectError = null,
  setFbPageConnectError,
  switchPage,
  disconnectFacebook,
  refreshFbAccount,
  fbSettings,
  updateFbSettings,
  renderFbTemplate,
  publishToFacebookPipeline,
  isPublishingFb = false,
  publishFbProgress = 0,
  publishFbStage = '',
  publishFbError = null,
  lastPublishedFbPost = null,
  // Instagram props
  igAccount,
  availableIgAccounts = [],
  isIgConnected = false,
  isIgUserConnected = false,
  isIgAccountConnected = false,
  isLoadingIgAccount = false,
  igAccountError = null,
  connectInstagram,
  connectIgAccountById,
  isConnectingIgAccount = false,
  igAccountConnectError = null,
  setIgAccountConnectError,
  switchIgAccount,
  disconnectInstagram,
  refreshIgAccount,
  igSettings,
  updateIgSettings,
  renderIgTemplate,
  publishToInstagramPipeline,
  isPublishingIg = false,
  publishIgProgress = 0,
  publishIgStage = '',
  publishIgError = null,
  lastPublishedIgPost = null,
  activeTab: controlledActiveTab,
  onTabChange,
  onSocialRefresh,
  showToast,
  socialRefreshTrigger,
  onNavigateQueueTab,
  // YouTube Upload History props
  uploadHistory = [],
  uploadJobs = {},
  isLoadingHistory = false,
  onRetryUpload,
  refreshHistory,
  onOpenPreview,
  onPreviewClip,
  // Mobile sheet props
  isMobileSheet = false,
  isFullScreen = true,
  onToggleFullScreen,
  onCloseMobileSheet,
  onCloseSheet
}) {
  const [internalActiveTab, setInternalActiveTab] = useState('split-cut');
  const [queueEditorSubTab, setQueueEditorSubTab] = useState('scheduled');
  const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : internalActiveTab;
  const setActiveTab = (tabId) => {
    if (onTabChange) onTabChange(tabId);
    setInternalActiveTab(tabId);
  };

  const normalizedTab =
    (activeTab === 'history' || activeTab === 'upload-history' || activeTab === 'scheduled')
      ? 'queue'
      : (activeTab === 'background')
      ? 'backdrop'
      : activeTab;

  useEffect(() => {
    if (activeTab === 'history' || activeTab === 'upload-history') {
      setQueueEditorSubTab('history');
    } else if (activeTab === 'scheduled') {
      setQueueEditorSubTab('scheduled');
    }
  }, [activeTab]);

  // Resilient close handler for both prop naming conventions
  const handleClose = () => {
    if (typeof onCloseMobileSheet === 'function') {
      onCloseMobileSheet();
    } else if (typeof onCloseSheet === 'function') {
      onCloseSheet();
    }
  };

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
    { id: 'youtube', label: 'YouTube', icon: Youtube },
    { id: 'facebook', label: 'Facebook', icon: Share2 },
    { id: 'instagram', label: 'Instagram', icon: Instagram },
    { id: 'storage', label: 'Storage & DB', icon: Database },
    { id: 'queue', label: 'Queue & History', icon: Layers }
  ];

  const activeTabObj = tabs.find(t => t.id === normalizedTab) || tabs[0];
  const isHistoryDirectView = activeTab === 'history' || activeTab === 'upload-history';
  const DisplayIcon = isHistoryDirectView ? History : activeTabObj?.icon;
  const displayTitle = isHistoryDirectView ? 'Upload History' : activeTabObj?.label;

  return (
    <div className={isMobileSheet ? "bg-slate-900 flex flex-col h-full" : "bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg"}>
      {/* Mobile Sheet Top Bar with Back, Fullscreen Toggle & Close buttons */}
      {isMobileSheet && (
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950 border-b border-slate-800 shrink-0 sticky top-0 z-20">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleClose();
            }}
            aria-label="Back to video preview"
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl cursor-pointer touch-manipulation min-h-[44px] shadow-sm transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-orange-400 shrink-0" />
            <span>Back</span>
          </button>

          <div className="flex items-center space-x-2 min-w-0 px-2">
            {DisplayIcon && <DisplayIcon className="w-4 h-4 text-orange-400 shrink-0" />}
            <span className="text-sm font-bold text-white truncate">{displayTitle}</span>
          </div>

          <div className="flex items-center space-x-1">
            {onToggleFullScreen && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleFullScreen();
                }}
                aria-label={isFullScreen ? "Exit full screen" : "Open full screen"}
                className="w-11 h-11 text-slate-300 hover:text-white hover:bg-slate-800 active:bg-slate-700 rounded-xl flex items-center justify-center cursor-pointer touch-manipulation shrink-0 transition-colors"
                title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
              >
                {isFullScreen ? (
                  <Minimize2 className="w-4 h-4 text-slate-300" />
                ) : (
                  <Maximize2 className="w-4 h-4 text-slate-300" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClose();
              }}
              aria-label="Close edit sheet"
              className="w-11 h-11 text-slate-300 hover:text-white hover:bg-slate-800 active:bg-slate-700 rounded-xl flex items-center justify-center cursor-pointer touch-manipulation shrink-0 transition-colors"
            >
              <X className="w-5 h-5 text-slate-300 hover:text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Tab Navigation Header with Smooth Horizontal Momentum Scroll */}
      <div className="flex items-center justify-between px-2 sm:px-4 pt-2.5 sm:pt-3 border-b border-slate-800 bg-slate-950/70 overflow-x-auto no-scrollbar touch-manipulation">
        <div className="flex space-x-1 min-w-max pb-0.5">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = normalizedTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-t-xl transition-all border-t border-x cursor-pointer touch-manipulation whitespace-nowrap ${
                  isActive
                    ? t.id === 'youtube'
                      ? 'bg-slate-900 border-slate-800 text-red-400 border-b-2 border-b-red-500 shadow-sm'
                      : t.id === 'facebook'
                      ? 'bg-slate-900 border-slate-800 text-blue-400 border-b-2 border-b-blue-500 shadow-sm'
                      : t.id === 'instagram'
                      ? 'bg-slate-900 border-slate-800 text-pink-400 border-b-2 border-b-pink-500 shadow-sm'
                      : t.id === 'storage'
                      ? 'bg-slate-900 border-slate-800 text-indigo-400 border-b-2 border-b-indigo-500 shadow-sm'
                      : t.id === 'queue'
                      ? 'bg-slate-900 border-slate-800 text-amber-400 border-b-2 border-b-amber-500 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-orange-400 border-b-2 border-b-orange-500 shadow-sm'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${
                  isActive
                    ? t.id === 'youtube'
                      ? 'text-red-400'
                      : t.id === 'facebook'
                      ? 'text-blue-400'
                      : t.id === 'instagram'
                      ? 'text-pink-400'
                      : t.id === 'storage'
                      ? 'text-indigo-400'
                      : t.id === 'queue'
                      ? 'text-amber-400'
                      : 'text-orange-400'
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
                {t.id === 'facebook' && isFbConnected && (
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shrink-0" />
                )}
                {t.id === 'instagram' && isIgConnected && (
                  <span className="w-1.5 h-1.5 bg-pink-400 rounded-full shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab Panel Body */}
      <div className={`p-3.5 sm:p-5 ${isMobileSheet ? 'overflow-y-auto flex-1 pb-20' : ''}`}>
        {normalizedTab === 'split-cut' && (
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

        {normalizedTab === 'crop' && (
          <CropEditor
            cropSettings={cropSettings}
            onChange={onCropChange}
            onReset={onCropReset}
            bgSettings={bgSettings}
            onBgChange={onBgChange}
          />
        )}

        {(normalizedTab === 'backdrop' || activeTab === 'background') && (
          <BackgroundEditor
            bgSettings={bgSettings}
            onChange={onBgChange}
            cropSettings={cropSettings}
            onCropChange={onCropChange}
          />
        )}

        {normalizedTab === 'text' && (
          <TextEditor
            textSettings={textSettings}
            onChange={onTextChange}
            onNavigateTab={setActiveTab}
            ytSettings={ytSettings}
            updateYtSettings={updateYtSettings}
            fbSettings={fbSettings}
            igSettings={igSettings}
          />
        )}

        {normalizedTab === 'logo' && (
          <LogoEditor
            logoSettings={logoSettings}
            onChange={onLogoChange}
          />
        )}

        {normalizedTab === 'effects' && (
          <EffectsPanel
            effectsSettings={effectsSettings}
            onChange={onEffectsChange}
            onReset={onEffectsReset}
          />
        )}

        {normalizedTab === 'audio' && (
          <AudioPanel
            audioSettings={audioSettings}
            onChange={onAudioChange}
            detectedAudio={detectedAudio}
          />
        )}

        {normalizedTab === 'export' && (
          <ExportPanel
            exportSettings={exportSettings}
            onChange={onExportChange}
            sourceResolution={sourceResolution}
            detectedQuality={detectedQuality}
            detectedFps={detectedFps}
            textSettings={textSettings}
            onTextChange={onTextChange}
            movieName={movieName}
            videoData={videoData}
            ytSettings={ytSettings}
            fbSettings={fbSettings}
            igSettings={igSettings}
            onUpdateYtSettings={updateYtSettings}
            onUpdateFbSettings={updateFbSettings}
            onUpdateIgSettings={updateIgSettings}
          />
        )}

        {normalizedTab === 'youtube' && (
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
            fbSettings={fbSettings}
            igSettings={igSettings}
            onSwitchToPlatform={setActiveTab}
          />
        )}

        {normalizedTab === 'facebook' && (
          <FacebookPanel
            fbAccount={fbAccount}
            availablePages={availablePages}
            isConnected={isFbConnected}
            isUserConnected={isFbUserConnected}
            isPageConnected={isFbPageConnected}
            isLoadingAccount={isLoadingFbAccount}
            accountError={fbAccountError}
            connectFacebook={connectFacebook}
            connectPageById={connectFbPageById}
            isConnectingPage={isConnectingFbPage}
            pageConnectError={fbPageConnectError}
            setPageConnectError={setFbPageConnectError}
            switchPage={switchPage}
            disconnectFacebook={disconnectFacebook}
            refreshFbAccount={refreshFbAccount}
            fbSettings={fbSettings}
            updateFbSettings={updateFbSettings}
            renderFbTemplate={renderFbTemplate}
            publishToFacebookPipeline={publishToFacebookPipeline}
            isPublishing={isPublishingFb}
            publishProgress={publishFbProgress}
            publishStage={publishFbStage}
            publishError={publishFbError}
            lastPublishedPost={lastPublishedFbPost}
            apiAvailable={apiAvailable}
            isAuthenticated={isAuthenticated}
            onOpenAuth={onOpenAuth}
            videoData={videoData}
            customParts={customParts}
            completedClips={completedClips}
            textSettings={textSettings}
            onTextChange={onTextChange}
            ytSettings={ytSettings}
            igSettings={igSettings}
            isIgConnected={isIgConnected}
            isIgAccountConnected={isIgAccountConnected}
            igAccount={igAccount}
            renderIgTemplate={renderIgTemplate}
            publishToInstagramPipeline={publishToInstagramPipeline}
            onSwitchToPlatform={setActiveTab}
            onSocialRefresh={onSocialRefresh}
          />
        )}

        {normalizedTab === 'instagram' && (
          <InstagramPanel
            igAccount={igAccount}
            availableAccounts={availableIgAccounts}
            isConnected={isIgConnected}
            isUserConnected={isIgUserConnected}
            isAccountConnected={isIgAccountConnected}
            isLoadingAccount={isLoadingIgAccount}
            accountError={igAccountError}
            connectInstagram={connectInstagram}
            connectAccountById={connectIgAccountById}
            isConnectingAccount={isConnectingIgAccount}
            accountConnectError={igAccountConnectError}
            setAccountConnectError={setIgAccountConnectError}
            switchAccount={switchIgAccount}
            disconnectInstagram={disconnectInstagram}
            refreshIgAccount={refreshIgAccount}
            igSettings={igSettings}
            updateIgSettings={updateIgSettings}
            renderIgTemplate={renderIgTemplate}
            publishToInstagramPipeline={publishToInstagramPipeline}
            isPublishing={isPublishingIg}
            publishProgress={publishIgProgress}
            publishStage={publishIgStage}
            publishError={publishIgError}
            lastPublishedPost={lastPublishedIgPost}
            apiAvailable={apiAvailable}
            isAuthenticated={isAuthenticated}
            onOpenAuth={onOpenAuth}
            videoData={videoData}
            customParts={customParts}
            completedClips={completedClips}
            textSettings={textSettings}
            onTextChange={onTextChange}
            ytSettings={ytSettings}
            fbSettings={fbSettings}
            isFbConnected={isFbConnected}
            isFbPageConnected={isFbPageConnected}
            fbAccount={fbAccount}
            renderFbTemplate={renderFbTemplate}
            publishToFacebookPipeline={publishToFacebookPipeline}
            onSwitchToPlatform={setActiveTab}
            onSocialRefresh={onSocialRefresh}
          />
        )}

        {normalizedTab === 'storage' && (
          <StoragePanel
            isAuthenticated={isAuthenticated}
            showToast={showToast}
          />
        )}

        {normalizedTab === 'queue' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Layers className="w-4 h-4" />
                </div>
              </div>

              <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setQueueEditorSubTab('scheduled')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                    queueEditorSubTab === 'scheduled'
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Scheduled Videos</span>
                </button>
                <button
                  onClick={() => setQueueEditorSubTab('history')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                    queueEditorSubTab === 'history'
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Upload History</span>
                </button>
              </div>
            </div>

            {queueEditorSubTab === 'scheduled' ? (
              <ScheduledVideosSection
                refreshTrigger={socialRefreshTrigger || onSocialRefresh}
                showToast={showToast}
                completedClips={completedClips}
                onOpenPreview={onOpenPreview || onPreviewClip}
              />
            ) : (
              <SocialUploadHistorySection
                refreshTrigger={socialRefreshTrigger || onSocialRefresh}
                showToast={showToast}
                uploadHistory={uploadHistory}
                uploadJobs={uploadJobs}
                isLoadingHistory={isLoadingHistory}
                onRetryUpload={onRetryUpload}
                refreshHistory={refreshHistory}
                completedClips={completedClips}
                publishToFacebookPipeline={publishToFacebookPipeline}
                publishToInstagramPipeline={publishToInstagramPipeline}
                fbSettings={fbSettings}
                igSettings={igSettings}
                fbAccount={fbAccount}
                igAccount={igAccount}
                isFbConnected={isFbConnected}
                isIgConnected={isIgConnected}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

