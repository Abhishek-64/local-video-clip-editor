/**
 * BrandingPanel — Default branding settings + preset management
 * Lets users save/apply/edit/delete branding presets (logo + text defaults).
 * Applying a preset updates the logoSettings and textSettings in App.jsx.
 * Does NOT remove any existing logo or text editor functionality.
 */

import React, { useState } from 'react';
import {
  Star, Plus, Trash2, Copy, Check, Edit2, ChevronDown, ChevronUp,
  Image as ImageIcon, Type, RefreshCw, XCircle
} from 'lucide-react';

const TEXT_POSITIONS = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-center', label: 'Top Center' },
  { id: 'center', label: 'Center' },
  { id: 'bottom-center', label: 'Bottom Center' },
  { id: 'bottom-right', label: 'Bottom Right' }
];

const LOGO_POSITIONS = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-right', label: 'Bottom Right' }
];

export default function BrandingPanel({
  brandingPresets,
  addBrandingPreset,
  editBrandingPreset,
  removeBrandingPreset,
  isLoadingPresets,
  // Callbacks to apply to current session
  onApplyLogo,
  onApplyText,
  // Current settings for "Save as Preset"
  currentLogoSettings,
  currentTextSettings,
  apiAvailable
}) {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [applyStatus, setApplyStatus] = useState({});

  const handleSaveCurrentAsPreset = async () => {
    if (!newPresetName.trim()) return;
    setSaving(true);
    try {
      await addBrandingPreset({
        name: newPresetName.trim(),
        logo_enabled: currentLogoSettings?.enabled || false,
        logo_position: currentLogoSettings?.position || 'top-right',
        logo_size: currentLogoSettings?.size || 70,
        logo_opacity: currentLogoSettings?.opacity || 85,
        logo_margin: 16,
        text_enabled: currentTextSettings?.enabled !== false,
        text_template: currentTextSettings?.template || '{movie} - Part {part}',
        text_position: currentTextSettings?.position || 'top-center',
        text_font: currentTextSettings?.font || 'Inter, sans-serif',
        text_size: currentTextSettings?.fontSize || 28,
        text_color: currentTextSettings?.color || '#ffffff',
        text_outline: currentTextSettings?.outline || false,
        text_outline_color: currentTextSettings?.outlineColor || '#000000',
        text_outline_thickness: currentTextSettings?.outlineThickness || 3,
        text_bg_enabled: currentTextSettings?.bgEnabled || false,
        text_bg_color: currentTextSettings?.bgColor || '#000000'
      });
      setNewPresetName('');
      setIsCreating(false);
    } catch (err) {
      console.error('Failed to save preset:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleApply = (preset) => {
    // Apply logo settings
    if (onApplyLogo) {
      onApplyLogo({
        enabled: Boolean(preset.logo_enabled),
        position: preset.logo_position,
        size: preset.logo_size,
        opacity: preset.logo_opacity
      });
    }
    // Apply text settings
    if (onApplyText) {
      onApplyText({
        enabled: Boolean(preset.text_enabled),
        template: preset.text_template,
        position: preset.text_position,
        font: preset.text_font,
        fontSize: preset.text_size,
        color: preset.text_color,
        outline: Boolean(preset.text_outline),
        outlineColor: preset.text_outline_color,
        outlineThickness: preset.text_outline_thickness,
        bgEnabled: Boolean(preset.text_bg_enabled),
        bgColor: preset.text_bg_color
      });
    }
    setApplyStatus(prev => ({ ...prev, [preset.id]: true }));
    setTimeout(() => setApplyStatus(prev => ({ ...prev, [preset.id]: false })), 2000);
  };

  const handleDuplicate = async (preset) => {
    await addBrandingPreset({
      ...preset,
      name: `${preset.name} (Copy)`
    });
  };

  const handleStartEdit = (preset) => {
    setEditingId(preset.id);
    setEditForm({ ...preset });
  };

  const handleSaveEdit = async () => {
    await editBrandingPreset(editingId, editForm);
    setEditingId(null);
  };

  if (!apiAvailable) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-center space-y-2">
          <Star className="w-7 h-7 text-slate-600 mx-auto" />
          <p className="text-xs font-semibold text-slate-400">Branding Presets Require Backend</p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Set <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">VITE_API_URL</code> to enable
            cloud-synced branding presets. Your current logo and text settings still work locally.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── SAVE CURRENT AS PRESET ───────────────────────────── */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2">
        <p className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
          <Star className="w-3.5 h-3.5 text-amber-400" />
          <span>Save Current Settings as Preset</span>
        </p>
        <p className="text-[11px] text-slate-500">
          Saves your current logo + text settings as a named branding preset.
        </p>

        {isCreating ? (
          <div className="flex space-x-2">
            <input
              autoFocus
              type="text"
              value={newPresetName}
              onChange={e => setNewPresetName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveCurrentAsPreset(); if (e.key === 'Escape') setIsCreating(false); }}
              placeholder="Preset name..."
              className="flex-1 bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none"
            />
            <button
              onClick={handleSaveCurrentAsPreset}
              disabled={saving || !newPresetName.trim()}
              className="px-3 py-2 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50 cursor-pointer touch-manipulation"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
            </button>
            <button
              onClick={() => setIsCreating(false)}
              className="px-3 py-2 text-xs text-slate-400 hover:text-white bg-slate-800 rounded-lg cursor-pointer touch-manipulation"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer touch-manipulation flex items-center justify-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Save Current as New Preset</span>
          </button>
        )}
      </div>

      {/* ── PRESETS LIST ─────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Saved Presets ({brandingPresets.length})
          </p>
          {isLoadingPresets && <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />}
        </div>

        {brandingPresets.length === 0 ? (
          <div className="text-center py-6 bg-slate-950/40 rounded-xl border border-slate-800/80">
            <Star className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
            <p className="text-xs text-slate-500">No presets saved yet.</p>
            <p className="text-[11px] text-slate-600 mt-0.5">Save your current settings above to create one.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {brandingPresets.map(preset => {
              const isExpanded = expandedId === preset.id;
              const isEditing = editingId === preset.id;

              return (
                <div key={preset.id} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                  {/* Preset Header */}
                  <div className="p-3 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : preset.id)}
                      className="flex items-center space-x-2 min-w-0 flex-1 cursor-pointer text-left touch-manipulation"
                    >
                      <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-white truncate">{preset.name}</span>
                      <div className="flex items-center space-x-1 shrink-0">
                        {preset.logo_enabled ? (
                          <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">Logo</span>
                        ) : null}
                        {preset.text_enabled ? (
                          <span className="text-[10px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded">Text</span>
                        ) : null}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      )}
                    </button>

                    <div className="flex items-center space-x-1 shrink-0">
                      {/* Apply */}
                      <button
                        onClick={() => handleApply(preset)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer touch-manipulation ${
                          applyStatus[preset.id]
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-orange-500/15 text-orange-300 border border-orange-500/30 hover:bg-orange-500/25'
                        }`}
                      >
                        {applyStatus[preset.id] ? (
                          <span className="flex items-center space-x-1"><Check className="w-3 h-3" /><span>Applied</span></span>
                        ) : 'Apply'}
                      </button>

                      {/* Edit */}
                      <button
                        onClick={() => handleStartEdit(preset)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
                        title="Edit name"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Duplicate */}
                      <button
                        onClick={() => handleDuplicate(preset)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => removeBrandingPreset(preset.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer touch-manipulation"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Edit name form */}
                  {isEditing && (
                    <div className="px-3 pb-3 flex space-x-2 border-t border-slate-800 pt-2.5">
                      <input
                        autoFocus
                        type="text"
                        value={editForm.name || ''}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="flex-1 bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:border-orange-500 focus:outline-none"
                      />
                      <button onClick={handleSaveEdit} className="px-3 py-1.5 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg cursor-pointer touch-manipulation">Save</button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-slate-400 bg-slate-800 rounded-lg cursor-pointer touch-manipulation">Cancel</button>
                    </div>
                  )}

                  {/* Expanded details */}
                  {isExpanded && !isEditing && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-800/60 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5">
                            <ImageIcon className="w-3 h-3 text-purple-400" />
                            <span className="font-medium text-slate-300">Logo</span>
                          </div>
                          <p>{preset.logo_enabled ? `${preset.logo_position} · ${preset.logo_size}px · ${preset.logo_opacity}% opacity` : 'Disabled'}</p>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5">
                            <Type className="w-3 h-3 text-orange-400" />
                            <span className="font-medium text-slate-300">Text</span>
                          </div>
                          {preset.text_enabled ? (
                            <>
                              <p className="font-mono truncate">{preset.text_template}</p>
                              <p>{preset.text_position} · {preset.text_font?.split(',')[0]} · {preset.text_size}px</p>
                            </>
                          ) : <p>Disabled</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
