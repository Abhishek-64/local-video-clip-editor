/**
 * useTemplates — React Hook for Multi-Section Templates Management
 *
 * Persists and retrieves complete presets across:
 * - Text & Part # settings (textSettings)
 * - YouTube metadata & scheduling (ytSettings)
 * - Logo / watermark settings (logoSettings)
 *
 * Backed by Cloudflare D1 with automatic fallback to localStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getTemplates,
  saveTemplate,
  updateTemplate,
  deleteTemplate,
  isApiConfigured
} from '../services/apiService';

const LOCAL_STORAGE_TEMPLATES_KEY = 'video_clip_editor_local_templates';

function getLocalTemplates() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Failed to load local templates:', e);
    return [];
  }
}

function saveLocalTemplates(templates) {
  try {
    localStorage.setItem(LOCAL_STORAGE_TEMPLATES_KEY, JSON.stringify(templates));
  } catch (e) {
    console.warn('Failed to save local templates:', e);
  }
}

export function useTemplates({ isAuthenticated = false } = {}) {
  const [templates, setTemplates] = useState(getLocalTemplates);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const apiAvailable = isApiConfigured();

  // ── Fetch Templates from D1 ──────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    if (!apiAvailable) {
      setTemplates(getLocalTemplates());
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const serverTemplates = await getTemplates();
      if (Array.isArray(serverTemplates)) {
        setTemplates(serverTemplates);
        saveLocalTemplates(serverTemplates);
      }
    } catch (err) {
      console.warn('Could not load templates from server, using local fallback:', err.message);
      setTemplates(getLocalTemplates());
    } finally {
      setIsLoading(false);
    }
  }, [apiAvailable]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates, isAuthenticated]);

  // ── Create New Template ──────────────────────────────────────────────────────

  const createNewTemplate = useCallback(async ({
    name,
    description = '',
    textSettings = null,
    ytSettings = null,
    logoSettings = null
  }) => {
    const newId = `tpl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const templateData = {
      id: newId,
      name: name.trim(),
      description: description ? description.trim() : null,
      text_data: textSettings,
      youtube_data: ytSettings,
      logo_data: logoSettings,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (apiAvailable) {
      try {
        const saved = await saveTemplate(templateData);
        if (saved) {
          setTemplates(prev => [saved, ...prev.filter(t => t.id !== saved.id)]);
          return saved;
        }
      } catch (err) {
        console.warn('Server save failed, falling back to local:', err.message);
      }
    }

    // Local fallback
    setTemplates(prev => {
      const updated = [templateData, ...prev];
      saveLocalTemplates(updated);
      return updated;
    });

    return templateData;
  }, [apiAvailable]);

  // ── Update Template ──────────────────────────────────────────────────────────

  const editTemplate = useCallback(async (id, updates) => {
    if (apiAvailable) {
      try {
        const updated = await updateTemplate(id, updates);
        if (updated) {
          setTemplates(prev => prev.map(t => (t.id === id ? { ...t, ...updated } : t)));
          return updated;
        }
      } catch (err) {
        console.warn('Server update failed:', err.message);
      }
    }

    // Local fallback
    setTemplates(prev => {
      const updated = prev.map(t => (t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t));
      saveLocalTemplates(updated);
      return updated;
    });
  }, [apiAvailable]);

  // ── Delete Template ──────────────────────────────────────────────────────────

  const removeTemplate = useCallback(async (id) => {
    if (apiAvailable) {
      try {
        await deleteTemplate(id);
      } catch (err) {
        console.warn('Server delete failed:', err.message);
      }
    }

    // Local update
    setTemplates(prev => {
      const updated = prev.filter(t => t.id !== id);
      saveLocalTemplates(updated);
      return updated;
    });
  }, [apiAvailable]);

  return {
    templates,
    isLoading,
    error,
    refreshTemplates: fetchTemplates,
    createNewTemplate,
    editTemplate,
    removeTemplate
  };
}
