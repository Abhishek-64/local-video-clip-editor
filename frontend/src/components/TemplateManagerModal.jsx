import React, { useState } from 'react';
import {
  Bookmark, X, Plus, Check, Trash2, Edit3, Sparkles, Type, Youtube,
  Image as ImageIcon, Clock, Calendar, Search, ArrowRight, LayoutTemplate,
  CheckCircle2, AlertCircle, FileText, Share2, Instagram
} from 'lucide-react';

export default function TemplateManagerModal({
  isOpen,
  onClose,
  templates = [],
  isLoading = false,
  onSaveTemplate,
  onApplyTemplate,
  onDeleteTemplate,
  currentTextSettings = {},
  currentYtSettings = {},
  currentFbSettings = {},
  currentIgSettings = {},
  currentLogoSettings = {}
}) {
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'save'
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [appliedId, setAppliedId] = useState(null);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!templateName.trim()) return;

    setIsSaving(true);
    try {
      await onSaveTemplate({
        name: templateName.trim(),
        description: templateDesc.trim(),
        textSettings: currentTextSettings,
        ytSettings: currentYtSettings,
        fbSettings: currentFbSettings,
        igSettings: currentIgSettings,
        logoSettings: currentLogoSettings
      });
      setTemplateName('');
      setTemplateDesc('');
      setActiveTab('list');
    } catch (err) {
      console.error('Failed to save template:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApply = (template) => {
    setAppliedId(template.id);
    onApplyTemplate(template);
    setTimeout(() => {
      setAppliedId(null);
      onClose();
    }, 600);
  };

  const filteredTemplates = templates.filter(t =>
    t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl animate-scaleUp max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center space-x-2">
                <span>Video Section Templates</span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full">
                  Cross-Section Presets
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Save and 1-click restore complete Text, YouTube, Facebook, and Logo watermark presets.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 sm:px-6 pt-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'list'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutTemplate className="w-4 h-4" />
            <span>Saved Templates ({templates.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('save')}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'save'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Save Current Settings as Template</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'list' ? (
            <div className="space-y-3">
              {/* Search Bar */}
              {templates.length > 3 && (
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search templates..."
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-white pl-9 pr-4 py-2 rounded-xl focus:border-orange-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Templates List */}
              {isLoading ? (
                <div className="text-center py-10 space-y-2">
                  <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-slate-400">Loading saved templates...</p>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-10 space-y-3 bg-slate-950/40 rounded-2xl border border-slate-800/80 p-6">
                  <LayoutTemplate className="w-10 h-10 text-slate-600 mx-auto" />
                  <div>
                    <p className="text-sm font-semibold text-slate-300">
                      {searchQuery ? 'No templates match your search.' : 'No saved templates yet.'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Save your current Title, YouTube metadata, Facebook captions, and Logo settings as a template to apply them in 1 click for future videos.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('save')}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer inline-flex items-center space-x-1.5 shadow-md shadow-orange-500/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Your First Template</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredTemplates.map((template) => {
                    const textConfig = typeof template.text_data === 'string' ? JSON.parse(template.text_data || '{}') : template.text_data;
                    const ytConfig = typeof template.youtube_data === 'string' ? JSON.parse(template.youtube_data || '{}') : template.youtube_data;
                    const fbConfig = typeof template.facebook_data === 'string' ? JSON.parse(template.facebook_data || '{}') : template.facebook_data;
                    const igConfig = typeof template.instagram_data === 'string' ? JSON.parse(template.instagram_data || '{}') : (template.instagram_data || template.ig_data);
                    const logoConfig = typeof template.logo_data === 'string' ? JSON.parse(template.logo_data || '{}') : template.logo_data;
                    const isApplied = appliedId === template.id;

                    return (
                      <div
                        key={template.id}
                        className="p-3.5 sm:p-4 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-slate-700/80 rounded-2xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm group"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs sm:text-sm font-bold text-white truncate">
                              {template.name}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {new Date(template.created_at || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          </div>

                          {template.description && (
                            <p className="text-[11px] text-slate-400 line-clamp-1">
                              {template.description}
                            </p>
                          )}

                          {/* Section Pills */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {textConfig && (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded-md text-[10px] font-medium">
                                <Type className="w-2.5 h-2.5" />
                                <span>Text: {textConfig.movieName || textConfig.template || 'Custom'}</span>
                              </span>
                            )}

                            {ytConfig && (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-red-500/10 text-red-300 border border-red-500/20 rounded-md text-[10px] font-medium">
                                <Youtube className="w-2.5 h-2.5" />
                                <span>YouTube: {(ytConfig.yt_tags || []).length} tags</span>
                              </span>
                            )}

                            {fbConfig && (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-sky-500/10 text-sky-300 border border-sky-500/20 rounded-md text-[10px] font-medium">
                                <Share2 className="w-2.5 h-2.5" />
                                <span>Facebook: {fbConfig.fb_content_type === 'reel' ? 'Reel' : 'Video'}</span>
                              </span>
                            )}

                            {igConfig && (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-pink-500/10 text-pink-300 border border-pink-500/20 rounded-md text-[10px] font-medium">
                                <Instagram className="w-2.5 h-2.5" />
                                <span>Instagram: {(igConfig.ig_tags || []).length} tags</span>
                              </span>
                            )}

                            {logoConfig && logoConfig.enabled && (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-md text-[10px] font-medium">
                                <ImageIcon className="w-2.5 h-2.5" />
                                <span>Logo Watermark</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center space-x-2 self-end sm:self-center shrink-0">
                          <button
                            onClick={() => handleApply(template)}
                            disabled={isApplied}
                            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer touch-manipulation ${
                              isApplied
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white shadow-md shadow-orange-500/15'
                            }`}
                          >
                            {isApplied ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Applied!</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Apply Preset</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => {
                              if (confirm(`Delete template "${template.name}"?`)) {
                                onDeleteTemplate(template.id);
                              }
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Delete template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Save Current Configuration as New Template Form */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Action Movies Preset, Anime Shorts, Tech Talk"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 text-white text-xs sm:text-sm px-3.5 py-2.5 rounded-xl outline-none shadow-inner"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="e.g. Standard layout for 1-minute vertical cuts with top header watermark and gaming tags"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 text-white text-xs px-3.5 py-2 rounded-xl outline-none resize-none shadow-inner"
                />
              </div>

              {/* What will be saved overview */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Configuration to be Saved in this Template:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-left">
                  {/* Text Section Preview */}
                  <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
                    <div className="flex items-center space-x-1.5 text-blue-400 text-xs font-semibold">
                      <Type className="w-3.5 h-3.5" />
                      <span>Text &amp; Part #</span>
                    </div>
                    <p className="text-[10px] text-slate-300 font-mono truncate">
                      Title: {currentTextSettings?.movieName || 'My Movie'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      Tpl: {currentTextSettings?.template || '{movie} - Part {part}'}
                    </p>
                  </div>

                  {/* YouTube Section Preview */}
                  <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
                    <div className="flex items-center space-x-1.5 text-red-400 text-xs font-semibold">
                      <Youtube className="w-3.5 h-3.5" />
                      <span>YouTube Defaults</span>
                    </div>
                    <p className="text-[10px] text-slate-300 font-mono truncate">
                      Tags: {(currentYtSettings?.yt_tags || []).length} active
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      Type: {currentYtSettings?.yt_content_type === 'video' ? 'Standard Video' : 'Shorts'}
                    </p>
                  </div>

                  {/* Facebook Section Preview */}
                  <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
                    <div className="flex items-center space-x-1.5 text-sky-400 text-xs font-semibold">
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Facebook Defaults</span>
                    </div>
                    <p className="text-[10px] text-slate-300 font-mono truncate">
                      Tags: {(currentFbSettings?.fb_tags || []).length} active
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      Type: {currentFbSettings?.fb_content_type === 'video' ? 'Page Video' : 'Reels'}
                    </p>
                  </div>

                  {/* Instagram Section Preview */}
                  <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
                    <div className="flex items-center space-x-1.5 text-pink-400 text-xs font-semibold">
                      <Instagram className="w-3.5 h-3.5" />
                      <span>Instagram Defaults</span>
                    </div>
                    <p className="text-[10px] text-slate-300 font-mono truncate">
                      Tags: {(currentIgSettings?.ig_tags || []).length} active
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      Feed: {currentIgSettings?.ig_share_to_feed !== false ? 'Grid Enabled' : 'Reels Only'}
                    </p>
                  </div>

                  {/* Logo Section Preview */}
                  <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
                    <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-semibold">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Logo Watermark</span>
                    </div>
                    <p className="text-[10px] text-slate-300 font-mono truncate">
                      Status: {currentLogoSettings?.enabled ? 'Enabled' : 'Disabled'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      Pos: {currentLogoSettings?.position || 'top-right'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit button */}
              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !templateName.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 active:scale-98 disabled:opacity-50 rounded-xl shadow-lg shadow-orange-500/20 flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  {isSaving ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Save Template</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
