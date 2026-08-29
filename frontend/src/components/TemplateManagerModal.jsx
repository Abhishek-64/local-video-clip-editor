import React, { useState } from 'react';
import {
  Bookmark, X, Plus, Check, Trash2, Edit3, Sparkles, Type, Youtube,
  Image as ImageIcon, Clock, Calendar, Search, ArrowRight, LayoutTemplate,
  CheckCircle2, AlertCircle, FileText
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
                Save and 1-click restore complete Text, YouTube metadata, and Logo watermark configurations.
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
            <Bookmark className="w-4 h-4" />
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
            <span>Save Current Settings</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {activeTab === 'list' ? (
            <div className="space-y-3.5">
              {/* Search bar & count */}
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search saved templates..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 text-white text-xs pl-8 pr-3 py-2 rounded-xl outline-none"
                  />
                </div>
                <button
                  onClick={() => setActiveTab('save')}
                  className="px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/30 text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New Template</span>
                </button>
              </div>

              {/* Template Items */}
              {filteredTemplates.length === 0 ? (
                <div className="text-center py-10 bg-slate-950/40 rounded-2xl border border-slate-800/80 space-y-3">
                  <LayoutTemplate className="w-10 h-10 text-slate-600 mx-auto" />
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-slate-300">No Templates Found</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                      {searchQuery
                        ? 'No saved templates match your search.'
                        : 'You have not saved any templates yet. Click "Save Current Settings" to create your first preset!'}
                    </p>
                  </div>
                  {!searchQuery && (
                    <button
                      onClick={() => setActiveTab('save')}
                      className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer inline-flex items-center space-x-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Save Current Settings as Template</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:gap-3">
                  {filteredTemplates.map(template => {
                    const textConfig = typeof template.text_data === 'string' ? JSON.parse(template.text_data || '{}') : (template.text_data || {});
                    const ytConfig = typeof template.youtube_data === 'string' ? JSON.parse(template.youtube_data || '{}') : (template.youtube_data || {});
                    const logoConfig = typeof template.logo_data === 'string' ? JSON.parse(template.logo_data || '{}') : (template.logo_data || {});
                    const isApplied = appliedId === template.id;

                    const tagList = Array.isArray(ytConfig.yt_tags) ? ytConfig.yt_tags : [];

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
                                <span>YouTube: {tagList.length} tags</span>
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
                                <Check className="w-3.5 h-3.5" />
                                <span>Apply to All</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete template "${template.name}"?`)) {
                                onDeleteTemplate(template.id);
                              }
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer touch-manipulation"
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
            /* Save Current Configuration Form */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  Template Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Anime Shorts Standard, Movie Clip Highlight, Reel Preset"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 text-white text-xs sm:text-sm px-3.5 py-2.5 rounded-xl outline-none shadow-inner"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  Description <span className="text-slate-500 text-[10px]">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="e.g. Top banner with #Shorts and 10 default viral tags"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 text-white text-xs px-3.5 py-2 rounded-xl outline-none shadow-inner"
                />
              </div>

              {/* What will be stored preview cards */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Configuration to be Saved in this Template:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-left">
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
                      <span>YouTube Section</span>
                    </div>
                    <p className="text-[10px] text-slate-300 font-mono truncate">
                      Tags: {(currentYtSettings?.yt_tags || []).length} active
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      Mode: {currentYtSettings?.yt_default_upload || 'manual'}
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
