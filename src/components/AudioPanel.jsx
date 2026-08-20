import React, { useRef } from 'react';
import { Gauge, Volume2, Music, MicOff, VolumeX, Upload, Trash2, Mic, Sparkles, Sliders, CheckCircle2 } from 'lucide-react';

export default function AudioPanel({
  audioSettings,
  onChange,
  detectedAudio
}) {
  const musicFileInputRef = useRef(null);
  const voiceFileInputRef = useRef(null);

  const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const volumeLevels = [0, 25, 50, 75, 100, 125, 150, 200];

  const updateSetting = (key, value) => {
    onChange({
      ...audioSettings,
      [key]: value
    });
  };

  const handleMusicFile = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const url = URL.createObjectURL(file);
      onChange({
        ...audioSettings,
        bgMusicEnabled: true,
        bgMusicFile: file,
        bgMusicUrl: url
      });
    }
  };

  const clearMusic = () => {
    if (audioSettings.bgMusicUrl) {
      URL.revokeObjectURL(audioSettings.bgMusicUrl);
    }
    onChange({
      ...audioSettings,
      bgMusicEnabled: false,
      bgMusicFile: null,
      bgMusicUrl: null
    });
  };

  const handleVoiceFile = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const url = URL.createObjectURL(file);
      onChange({
        ...audioSettings,
        voiceoverEnabled: true,
        voiceoverFile: file,
        voiceoverUrl: url,
        voiceoverVolume: audioSettings.voiceoverVolume ?? 100
      });
    }
  };

  const clearVoiceover = () => {
    if (audioSettings.voiceoverUrl) {
      URL.revokeObjectURL(audioSettings.voiceoverUrl);
    }
    onChange({
      ...audioSettings,
      voiceoverEnabled: false,
      voiceoverFile: null,
      voiceoverUrl: null
    });
  };

  return (
    <div className="space-y-6">
      {/* ── AUTO-DETECTED AUDIO PROFILE BADGE ── */}
      {detectedAudio && (
        <div className="bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-slate-900 border border-purple-500/30 p-3.5 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-bold text-white">Auto-Detected Audio Profile</span>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono">
                  {detectedAudio.channels || 'Stereo'} · {Math.round((detectedAudio.sampleRate || 48000) / 1000)}kHz
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{detectedAudio.label || 'Human Voice & Audio Track Active'}</p>
            </div>
          </div>
          <span className="text-xs text-emerald-400 font-medium flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline" /> Analyzed
          </span>
        </div>
      )}

      {/* Playback Speed Section */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
          <Gauge className="w-3.5 h-3.5 text-orange-400" />
          <span>Playback Speed Multiplier</span>
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => updateSetting('speed', s)}
              className={`py-2 px-3 rounded-xl border text-center text-xs font-mono font-medium transition-all cursor-pointer ${
                audioSettings.speed === s
                  ? 'bg-orange-500/10 border-orange-500 text-white shadow-sm'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Volume Adjustment & Silent Monitoring */}
      <div className="space-y-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
            <Volume2 className="w-3.5 h-3.5 text-orange-400" />
            <span>Main Video Audio Volume</span>
          </label>
          <span className="font-mono text-xs text-amber-400">{audioSettings.volume}%</span>
        </div>

        {/* Volume Slider */}
        <input
          type="range"
          min="0"
          max="200"
          step="5"
          value={audioSettings.volume}
          onChange={(e) => updateSetting('volume', parseInt(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
        />

        {/* Volume Level Quick Buttons */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {volumeLevels.map((lvl) => (
            <button
              key={lvl}
              onClick={() => updateSetting('volume', lvl)}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-md border transition-colors cursor-pointer ${
                audioSettings.volume === lvl
                  ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {lvl === 0 ? 'Mute' : `${lvl}%`}
            </button>
          ))}
        </div>

        {/* Silent Monitoring Option */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
          <div>
            <span className="text-xs font-medium text-white flex items-center space-x-1.5">
              <MicOff className="w-3.5 h-3.5 text-slate-400" />
              <span>Silent Preview Monitoring</span>
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Mutes local preview speakers while keeping full audio in the exported clips
            </p>
          </div>
          <button
            onClick={() => updateSetting('silentMonitoring', !audioSettings.silentMonitoring)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
              audioSettings.silentMonitoring ? 'bg-orange-500' : 'bg-slate-800'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                audioSettings.silentMonitoring ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* ── ADD ANOTHER VOICE / VOICEOVER / COMMENTARY TRACK ── */}
      <div className="space-y-4 bg-slate-950/60 p-4 rounded-xl border border-purple-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white">Add Another Voice / Voiceover Track</span>
              <p className="text-[11px] text-slate-400">Add secondary speech, translation, or voiceover</p>
            </div>
          </div>
          <button
            onClick={() => updateSetting('voiceoverEnabled', !audioSettings.voiceoverEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
              audioSettings.voiceoverEnabled ? 'bg-purple-500' : 'bg-slate-800'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                audioSettings.voiceoverEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {audioSettings.voiceoverEnabled && (
          <div className="space-y-4 pt-2">
            <input
              ref={voiceFileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.aac,.m4a"
              onChange={handleVoiceFile}
              className="hidden"
            />

            {!audioSettings.voiceoverUrl ? (
              <div
                onClick={() => voiceFileInputRef.current?.click()}
                className="border-2 border-dashed border-purple-500/40 hover:border-purple-400 bg-purple-500/5 p-4 rounded-xl text-center cursor-pointer transition-colors"
              >
                <Upload className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                <p className="text-xs font-medium text-white">Upload Another Voice Track (MP3, WAV, M4A, AAC)</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Mix commentary, narration, or dubbing</p>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-purple-950/30 p-2.5 rounded-lg border border-purple-500/30">
                <div className="flex items-center space-x-2 truncate">
                  <Mic className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span className="text-xs text-white truncate max-w-xs">{audioSettings.voiceoverFile?.name || 'Voiceover Track'}</span>
                </div>
                <button
                  onClick={clearVoiceover}
                  className="p-1 text-rose-400 hover:text-rose-300 rounded cursor-pointer"
                  title="Remove Voice Track"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Voiceover Volume & Auto-Ducking */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Voice Track Volume</span>
                  <span className="font-mono text-purple-400">{audioSettings.voiceoverVolume ?? 100}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={audioSettings.voiceoverVolume ?? 100}
                  onChange={(e) => updateSetting('voiceoverVolume', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="autoDucking"
                    checked={audioSettings.autoDucking ?? true}
                    onChange={(e) => updateSetting('autoDucking', e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-purple-500"
                  />
                  <label htmlFor="autoDucking" className="text-xs text-slate-300">
                    Smart Voice Ducking (Lowers video audio for clear speech)
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="muteOrigForVoice"
                    checked={audioSettings.muteOriginal || false}
                    onChange={(e) => updateSetting('muteOriginal', e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-purple-500"
                  />
                  <label htmlFor="muteOrigForVoice" className="text-xs text-slate-300">
                    Replace original audio completely with this voice
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Background Music Section */}
      <div className="space-y-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Music className="w-4 h-4 text-orange-400" />
            <div>
              <span className="text-xs font-semibold text-white">Background Music Track</span>
              <p className="text-[11px] text-slate-400">Mix background soundtrack or ambient beats</p>
            </div>
          </div>
          <button
            onClick={() => updateSetting('bgMusicEnabled', !audioSettings.bgMusicEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
              audioSettings.bgMusicEnabled ? 'bg-orange-500' : 'bg-slate-800'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                audioSettings.bgMusicEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {audioSettings.bgMusicEnabled && (
          <div className="space-y-4 pt-2">
            <input
              ref={musicFileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.aac,.m4a"
              onChange={handleMusicFile}
              className="hidden"
            />

            {!audioSettings.bgMusicUrl ? (
              <div
                onClick={() => musicFileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-900/60 p-4 rounded-xl text-center cursor-pointer transition-colors"
              >
                <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                <p className="text-xs font-medium text-white">Select Audio File (MP3, WAV, AAC)</p>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <div className="flex items-center space-x-2 truncate">
                  <Music className="w-4 h-4 text-orange-400 flex-shrink-0" />
                  <span className="text-xs text-white truncate max-w-xs">{audioSettings.bgMusicFile?.name || 'Audio Track'}</span>
                </div>
                <button
                  onClick={clearMusic}
                  className="p-1 text-rose-400 hover:text-rose-300 rounded cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Audio Mixing Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Music Volume</span>
                  <span className="font-mono text-amber-400">{audioSettings.bgMusicVolume || 30}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audioSettings.bgMusicVolume || 30}
                  onChange={(e) => updateSetting('bgMusicVolume', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
