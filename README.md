# Automatic Video Clipper

Automatic Video Clipper is a browser-based video clipping and editing tool for turning long videos into social-media-ready clips, reels, shorts, square posts, and cinematic exports.

Video, audio, image, and export processing is designed to run locally in the browser. Source media is not uploaded by the editor's current implementation.

## Highlights

- Local drag-and-drop video editing
- Automatic resolution, FPS, duration, file-size, and audio-profile detection
- Timeline range selection and batch clip splitting
- Preset and custom aspect ratios
- Interactive crop, pan, zoom, and framing controls
- Optional local face tracking for vertical clips
- Blurred-video, image, and solid-color backdrops
- Title, part-number, CTA, and custom text overlays
- Draggable text and logo overlays
- Logo and watermark support
- Color presets, manual grading, blur, and fade transitions
- Original audio, voiceover, and background music mixing
- Voice ducking and original-audio replacement
- MP4/WebM export profiles
- WebCodecs H.264/AAC export when supported
- MediaRecorder fallback for broader browser compatibility
- Processing queue with progress, cancellation, and concurrency limits
- Individual downloads, selected ZIP downloads, and full ZIP downloads
- Responsive desktop and mobile interface

## User Workflow

1. Select a local video or drag one into the upload area.
2. Let the browser analyze metadata, quality, frame rate, and audio.
3. Set the source range and split it into parts using duration, count, or manual times.
4. Configure crop, backdrop, text, logo, effects, audio, and export options.
5. Preview the result in phone or framing mode.
6. Generate all parts, the first N parts, or a selected part range.
7. Monitor jobs in the processing queue.
8. Preview, download, or package completed clips into a ZIP archive.

## Supported Input Video

The file picker accepts MP4, MOV, WebM, MKV, AVI, and M4V files. The browser must be able to decode the selected media. Unsupported or corrupted files display an error during metadata loading.

The uploader automatically records the original file object, file name, file size, MIME type, object URL, duration, video dimensions, quality profile, FPS profile, and audio profile.

When a file is loaded, its cleaned filename becomes the default movie name and the recommended resolution/FPS are applied to export settings.

## Preview

The preview supports play/pause, current-time seeking, restart, mute/unmute, preview volume, fullscreen mode, phone preview, framing preview, live visual filters, live backgrounds, live text overlays, and live logos.

Text and logos can be dragged directly on the preview. Custom crop mode exposes an interactive crop rectangle with corner and edge resize handles.

## Crop and Output Formats

Available crop modes:

| Mode | Output use |
| --- | --- |
| `9:16` | Instagram Reels, YouTube Shorts, TikTok |
| `16:9` | Standard YouTube and landscape video |
| `1:1` | Square Instagram/Facebook posts |
| `4:5` | Portrait Instagram feed posts |
| `21:9` | Ultrawide and cinematic video |
| `custom` | Freeform crop box |
| `original` | Original source aspect and dimensions |

Crop controls include fit mode, fill mode, manual X/Y positioning, zoom, custom crop width/height, center/left/right/top/bottom alignment, full-frame reset, interactive movement, and interactive resizing.

Standard output dimensions are calculated from the selected format and resolution: 720p, 1080p, 1440p, 4K, or Original.

## Local Face Tracking

The optional Smart AI Face Tracking feature keeps the active speaker centered during vertical fill/crop exports.

Implementation details:

- Runs locally in the browser
- Attempts the native browser `FaceDetector` API first
- Selects the largest detected face
- Uses a low-resolution canvas fallback when native detection is unavailable
- Smooths movement with an exponential moving average
- Re-centers gradually when a face is lost
- Checks faces periodically to limit processing cost

Face tracking is a local framing aid, not a cloud AI service.

## Timeline and Clip Splitting

The timeline provides global start time, global end time, current playhead position, selected-duration display, visual part markers, and part preview seeking.

### Split by Duration

Built-in presets are 15, 30, 60, and 90 seconds. Custom duration accepts values from 5 through 3600 seconds.

### Split by Part Count

- Choose between 1 and 200 parts
- Equal-duration parts are generated automatically
- Quick count buttons include 1, 2, 3, 5, and 10
- One part can represent the complete selected range

### Manual Part Table

Each part supports editable start/end times, calculated duration, preview seeking, deletion, and automatic renumbering. Parts can be added after the last part or reset to equal intervals. The full source can also be converted into one part.

## Batch Processing Queue

The queue can generate all available parts, the first N parts, or an inclusive selected part range.

Each queue job stores the selected video, time range, part number, filename, crop, backdrop, text, logo, effects, audio, and export settings.

Supported statuses are Waiting, Processing, Completed, Failed, and Cancelled. Queue controls include per-job progress, cancellation, clearing, completed-job preview, and individual downloads.

Browser concurrency is intentionally capped between one and two active jobs for canvas, memory, and GPU stability.

## Backdrop and Blur

Backdrop modes are blurred source video, a custom uploaded image, or a solid color. Custom images support common JPG, PNG, and WebP formats.

Controls include blur intensity from 0 to 100 percent, brightness/opacity from 15 to 100 percent, a custom color picker, image replacement, and image removal. Backdrops are primarily used for fit-mode vertical exports.

## Text and Part Numbering

The primary overlay supports enable/disable, movie or series name, custom template, starting part number, zero-padding, seven position presets, drag positioning, X/Y controls, font choice, font size, text color, outline/color/thickness, background pill/color, automatic line wrapping, and automatic font fitting.

Available fonts include Inter-style sans serif, Impact, Arial, Georgia, and Monospace.

Supported placeholders are `{movie}` and `{part}`.

Example templates:

```text
{movie} - Part {part}
{movie}
Part {part}
Part {part} | {movie}
PART {part}
```

### Extra Text Overlays

Extra overlays are intended for social handles, calls to action, banners, and episode labels. Each item supports add/edit/hide/show/delete, custom text, drag positioning, X/Y sliders, 14px-48px font size, color, optional pill background, and outline styling.

## Logo and Watermark

Logo support includes PNG, JPEG, and WebP uploads, transparent PNGs, enable/disable, replacement, removal, width from 25px to 250px, opacity from 10% to 100%, four corner presets, drag positioning, and X/Y positioning from 3% to 97%.

## Effects

Built-in presets:

- Normal / None
- Cinematic
- Vintage 70s
- Warm Sunset
- Cool Nordic
- Black & White
- Classic Sepia
- High Contrast
- Faded Film

Manual controls include brightness (50%-150%), contrast (50%-180%), saturation (0%-200%), sepia, grayscale, invert, blur, fade in, and fade out. Fade durations are 0.25 seconds, 0.5 seconds, 1 second, or 2 seconds.

Effects are previewed with CSS filters and rendered into exports using canvas filters or the available GPU/WebGL path.

## Audio

Original audio supports volume from 0% to 200%, quick presets, export muting, and silent preview monitoring.

Playback speeds are 0.5x, 0.75x, 1x, 1.25x, 1.5x, and 2x.

Voiceover accepts MP3, WAV, AAC, and M4A. It supports independent volume, smart voice ducking, original-audio replacement, and removal.

Background music accepts MP3, WAV, AAC, and M4A. It supports independent volume, seamless looping, replacement, and removal.

The offline audio engine provides source slicing, speed-aware sampling, voiceover mixing, music looping, windowed RMS voice detection, automatic original-audio ducking to approximately 35% during speech, stereo output, a 48 kHz mix target, and soft limiting to reduce clipping.

## Export Settings

### Smart Profiles

| Profile | Resolution | Bitrate | FPS |
| --- | --- | --- | --- |
| Fast | 720p | Standard | 30 |
| Balanced (Recommended) | 1080p | High | 30 |
| High Quality | 1080p | Ultra | 60 |
| Ultra 4K | 4K | Ultra | 60 |

### Formats

MP4 uses H.264 video and AAC audio when supported and is recommended for Reels, Shorts, TikTok, YouTube, and mobile playback. WebM uses a supported VP9/Opus-style browser codec and is useful for web output.

### Resolution, Bitrate, and FPS

Resolutions are 720p, 1080p, 1440p, 4K, and Original. Video bitrate presets are Standard (approximately 5 Mbps), High (approximately 8.5 Mbps), and Ultra (approximately 16 Mbps, with a higher target for 4K). Frame rates are source-matched, 24, 30, or 60 FPS.

Audio bitrate choices are 128, 192, 256, and 320 kbps. Worker concurrency can be set to one stable job or two parallel jobs for high-memory systems.

## Export Architecture

The export engine detects browser capabilities and chooses an available pipeline.

### WebCodecs Pipeline

When H.264 WebCodecs support is available and MP4 is selected, the engine uses `VideoEncoder`, H.264 Baseline encoding, deterministic timestamps, periodic keyframes, canvas frame rendering, optional face tracking, offline audio mixing, `AudioEncoder` for AAC when available, and the internal JavaScript MP4 muxer.

The muxer creates an ISO Base Media File Format MP4 containing optional video and audio tracks. It writes `ftyp`, `moov`, and `mdat` boxes and places metadata before media payload for fast-start playback.

### MediaRecorder Fallback

If WebCodecs is unavailable or fails, the application uses Canvas capture streams, browser-supported MP4/WebM MIME types, Web Audio routing, source/voiceover/music mixing, canvas crop and overlay rendering, frame callbacks or animation-frame fallback, progress watchdogs, heartbeat completion checks, and abortable processing.

The requested container is preferred, but the browser may return another supported format. An MP4 request can therefore produce WebM on browsers without MP4 MediaRecorder support.

## Generated Clips and ZIP Downloads

Completed clips can be previewed, downloaded individually, selected using cards/checkboxes, selected all at once, quickly selected by first 1/2/3/5 clips, or packaged into a ZIP.

ZIP output supports all completed clips or selected clips, progress reporting, sanitized archive/folder names, and DEFLATE compression.

Filenames use the movie name, part number, template, zero-padding option, and extension. Invalid Windows and Unix filename characters are replaced automatically.

Example:

```text
My Movie - Part 01.mp4
```

## Privacy and Data Handling

The current editor's processing path is local to the browser. The editing workflow does not upload source videos, voiceover files, background music, logos, background images, or generated clips.

Object URLs are revoked when media is removed, the queue is cleared, or the application is unmounted. Generated clips are session-local and should be downloaded before refreshing or closing the page.

## Capability Detection

The capability detector checks WebCodecs, VideoEncoder, VideoDecoder, AudioEncoder, AudioDecoder, H.264 support, AAC support, WebGL, WebGL2, WebGPU, Web Workers, OffscreenCanvas, MediaRecorder, MP4/WebM MediaRecorder support, hardware acceleration indicators, CPU cores, device memory, recommended concurrency, and recommended maximum export resolution.

## Responsive Interface

Desktop uses a preview/timeline column, editor-tab column, and queue/output area. Mobile provides Preview & Cut, Style & Text, and Queue views.

The interface includes touch-friendly controls, mobile drag interactions, safe-area padding, horizontally scrollable editor tabs, responsive clip grids, and fullscreen preview support.

## Requirements

- Node.js 18 or newer
- npm or Bun
- A modern browser with local media playback support

Recommended browsers are Google Chrome, Microsoft Edge, and other Chromium-based browsers. For faster exports, use WebCodecs/WebGL2 support, at least four CPU cores, and at least 8 GB RAM for high-resolution or parallel jobs.

## Installation

```bash
npm install
```

Or with Bun:

```bash
bun install
```

## Development

```bash
npm run dev
```

The Vite server uses port `3000` and listens on all host interfaces:

```text
http://localhost:3000
```

## Production Commands

```bash
npm run build      # Create a production build
npm run preview    # Preview the production build
npm run lint       # Run TypeScript validation
npm run clean      # Remove generated build files
```

## Project Structure

```text
.
├── index.html
├── metadata.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── assets/
├── public/
└── src/
    ├── App.jsx
    ├── index.css
    ├── main.jsx
    ├── components/
    │   ├── AudioPanel.jsx
    │   ├── BackgroundEditor.jsx
    │   ├── CropEditor.jsx
    │   ├── EditorTabs.jsx
    │   ├── EffectsPanel.jsx
    │   ├── ExportPanel.jsx
    │   ├── GeneratedClips.jsx
    │   ├── Header.jsx
    │   ├── LogoEditor.jsx
    │   ├── ProcessingQueue.jsx
    │   ├── TextEditor.jsx
    │   ├── Timeline.jsx
    │   ├── VideoPreview.jsx
    │   └── VideoUploader.jsx
    ├── hooks/
    │   └── useProcessingQueue.js
    ├── services/
    │   ├── audioEngine.js
    │   ├── capabilityDetector.js
    │   ├── exportEngine.js
    │   ├── faceDetectionService.js
    │   ├── mp4Muxer.js
    │   ├── videoProcessingEngine.js
    │   ├── webglEffectsPipeline.js
    │   └── zipService.js
    ├── utils/
    │   ├── crop.js
    │   ├── filename.js
    │   ├── mediaDetector.js
    │   └── time.js
    └── workers/
        └── exportWorker.js
```

## Module Responsibilities

- `App.jsx`: owns editor state, connects panels, creates queue jobs, and handles notifications.
- `VideoUploader.jsx`: validates local files and detects video/audio metadata.
- `VideoPreview.jsx`: provides playback, live rendering, overlays, and interactive positioning.
- `Timeline.jsx`: manages selected ranges, automatic parts, and manual part times.
- `EditorTabs.jsx`: hosts crop, backdrop, text, logo, effects, audio, and export panels.
- `useProcessingQueue.js`: manages queue state, processing, cancellation, progress, downloads, and cleanup.
- `exportEngine.js`: selects WebCodecs or MediaRecorder export.
- `videoProcessingEngine.js`: contains the compatibility rendering pipeline and shared overlay rendering.
- `audioEngine.js`: decodes and mixes source, voiceover, and music audio offline.
- `capabilityDetector.js`: checks browser and device media capabilities.
- `faceDetectionService.js`: performs local face detection and smoothing.
- `mp4Muxer.js`: creates MP4 containers from encoded H.264/AAC chunks.
- `webglEffectsPipeline.js`: contains the WebGL shader effects pipeline and fallback support.
- `zipService.js`: packages completed clip blobs into ZIP archives.
- `crop.js`: calculates source crop windows and output canvas dimensions.
- `mediaDetector.js`: identifies quality, frame-rate, and audio profiles.
- `filename.js`: sanitizes names and generates output filenames.
- `time.js`: formats and parses time values.
- `exportWorker.js`: provides a worker-compatible export entry point.

## Environment Variables

The repository includes `.env.example` with AI Studio compatibility placeholders:

```env
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="MY_APP_URL"
```

The current editor source does not make a Gemini API request. The implemented editing workflow uses local browser APIs including WebCodecs, MediaRecorder, Canvas, WebGL, Web Audio, and JSZip.

## Browser Limitations

- Codec support varies by browser and operating system.
- MP4 requests may fall back to WebM if the browser lacks a compatible MP4 encoder.
- WebCodecs is not available in every browser.
- 4K output requires substantial memory, CPU, and GPU resources.
- Large source videos can consume significant browser memory.
- Audio decoding depends on browser codec support.
- Native face detection is not universally available; the local fallback is heuristic.
- Background tabs may be throttled by the browser.
- Generated object URLs are temporary and session-local.
- Generated clips should be downloaded before refreshing or closing the tab.
- The repository includes an export worker entry point, but the current React queue invokes the export engine directly.

## Technology Stack

- React 19
- React DOM
- Vite
- JSX and JavaScript
- TypeScript compiler for validation
- Tailwind CSS
- Tailwind Vite plugin
- Lucide React
- Motion
- WebCodecs
- MediaRecorder
- Canvas 2D
- WebGL/WebGL2
- Web Audio API
- JSZip

## License

No license is currently specified in the repository.
