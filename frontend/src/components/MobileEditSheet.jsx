import React, { useEffect } from 'react';

export default function MobileEditSheet({
  isOpen,
  onClose,
  isFullScreen = true,
  onToggleFullScreen,
  children
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    // Prevent background scrolling while sheet is open on mobile
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 lg:hidden flex flex-col ${isFullScreen ? '' : 'justify-end'}`}>
      {/* Backdrop (active when in sheet mode) */}
      {!isFullScreen && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity cursor-pointer"
          onClick={onClose}
          aria-label="Close editing panel"
        />
      )}

      {/* Slide-Up / Full-Screen Sheet */}
      <div
        className={`relative w-full bg-slate-900 z-10 flex flex-col overflow-hidden transition-all duration-200 ${
          isFullScreen
            ? 'h-[100dvh] max-h-[100dvh] rounded-none inset-0 border-0'
            : 'max-h-[88vh] h-[88vh] border-t border-slate-700 rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom'
        }`}
      >
        {/* Top Centered Drag Handle Pill (visible in sheet mode) */}
        {!isFullScreen && (
          <div
            className="w-12 h-1.5 bg-slate-700 hover:bg-slate-600 rounded-full mx-auto mt-2.5 mb-1 shrink-0 cursor-pointer touch-manipulation"
            onClick={onClose}
            title="Tap to dismiss"
          />
        )}

        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}
