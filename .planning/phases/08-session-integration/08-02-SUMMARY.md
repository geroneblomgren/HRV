---
phase: 08-session-integration
plan: "02"
subsystem: session-ui
tags: [eeg, waveform, neural-calm, summary, ppg, canvas]
dependency_graph:
  requires: [08-01]
  provides: [eeg-waveform-renderer, neural-calm-summary, ppg-source-badge]
  affects: [renderer.js, practice.js, discovery.js, index.html, styles.css]
tech_stack:
  added: []
  patterns: [canvas-2d, circular-buffer-rendering, conditional-ui-sections]
key_files:
  created: []
  modified:
    - js/renderer.js
    - js/practice.js
    - js/discovery.js
    - index.html
    - styles.css
decisions:
  - "EEG stacked layout: TP9 centered at h*0.3, TP10 at h*0.7 — symmetric within 80px canvas"
  - "Neural Calm summary section uses display:none toggle — hidden by default, shown when meanCalm != null"
  - "PPG source badge placed immediately after h2 title in both Practice summary and Discovery comparison"
metrics:
  duration_seconds: 179
  completed_date: "2026-04-03"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 5
---

# Phase 8 Plan 2: EEG Waveform + Neural Calm Summary

**One-liner:** Scrolling TP9/TP10 EEG waveform on Canvas (80px, stacked blue/purple channels) plus post-session Neural Calm metrics (mean, peak, time in deep calm) shown only when Muse was used.

## What Was Built

### Task 1: Scrolling EEG Waveform Canvas Renderer (commit: 1a600df)

Added `drawEEGWaveform()` to renderer.js:
- Constants: 256 Hz sample rate, 2s display window (512 samples), ±100 µV range
- Stacked layout: TP9 (blue `#3b82f6`) in top lane (centerY = h*0.3), TP10 (purple `#8b5cf6`) in bottom lane (centerY = h*0.7)
- Reads `AppState.eegBuffers[0]` (TP9) and `AppState.eegBuffers[3]` (TP10) via circular buffer index
- Flat-line placeholder when `!AppState.museConnected`
- Thin separator line at h/2 (rgba white 0.08) between channels
- `startRendering()` updated to accept 8th arg `eegCanvas` (null-guarded, backward compatible)
- `_setupAllCanvases()` and `stopRendering()` updated to handle EEG canvas

Added HTML: `eeg-waveform-canvas` (Discovery) and `practice-eeg-waveform-canvas` (Practice), each wrapped in `.viz-row.viz-row-eeg > .viz-card.viz-eeg`.

Added CSS: `.viz-row-eeg` (80px fixed height), `.viz-eeg` (#1a1a1a bg, border-radius 8px), `.viz-eeg canvas` (100% width/height).

Updated callers: `practice.js startPractice()` and `discovery.js startBlock()` now grab EEG canvas and pass as 8th arg.

### Task 2: Neural Calm Summary Metrics + PPG Source Badge (commit: 98ba104)

Added to Practice summary (`#practice-summary`):
- `<p id="summary-hr-source">` immediately after h2 — shows "HR Source: Muse PPG" when applicable
- `<div id="summary-neural-calm-section">` with 3-column grid containing mean/peak/time cards (IDs: `summary-mean-calm`, `summary-peak-calm`, `summary-time-calm`)

Added to Discovery comparison (`#discovery-comparison`):
- `<p id="discovery-hr-source">` after h2 — same PPG badge pattern

Updated `practice.js _showSummary()`: conditionally populates and shows/hides Neural Calm section based on `summary.meanCalm !== null`. Shows HR source badge when `AppState.hrSourceLabel === 'Muse PPG'`.

Updated `practice.js _onDone()`: resets both Neural Calm section and HR source visibility.

Updated `discovery.js _showComparison()`: populates and shows `discovery-hr-source` when Muse PPG.

Updated `discovery.js _onConfirm()`: hides `discovery-hr-source` on confirm.

Added CSS: `.summary-neural-calm-section`, `.summary-section-label`, `.summary-grid-neural` (3-col), `.neural-calm-value` (color #3b82f6), `.summary-hr-source` (12px, rgba white 0.4).

### Task 3: Human Verification (checkpoint — awaiting)

Verification of complete Muse-S session integration across 3 test scenarios.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files exist:
- js/renderer.js — modified with drawEEGWaveform, EEG constants, updated startRendering/stopRendering
- js/practice.js — modified with eegCanvas arg, _showSummary Neural Calm population, _onDone reset
- js/discovery.js — modified with eegCanvas arg, discovery-hr-source population/hide
- index.html — eeg-waveform-canvas, practice-eeg-waveform-canvas, summary-neural-calm-section, summary-hr-source, discovery-hr-source
- styles.css — viz-row-eeg, viz-eeg, summary-neural-calm-section, summary-hr-source CSS

Commits:
- 1a600df — feat(08-02): add scrolling EEG waveform Canvas renderer
- 98ba104 — feat(08-02): add Neural Calm summary metrics and PPG source badge

## Self-Check: PASSED
