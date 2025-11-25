/**
 * Web Audio Player - Main Logic
 * Uses SoundTouchJS for Pitch/Tempo control and custom sync logic for Video.
 */

// --- Debug Logging ---
function log(msg) {
    // Debug console removed for production
    console.log(msg);
}

// --- Global Variables ---
let audioCtx;
let soundTouch;
let pitchShifter;
let audioBuffer;
let isPlaying = false;
let isVideo = false;

// Playback State
let startTime = 0;
let pauseTime = 0;
let savedTimePlayed = 0; // Time played before current pause/seek
let loopStart = null;
let loopEnd = null;
let isLoopActive = false; // A-B Loop
let isRepeatAll = false; // Repeat All

// DOM Elements
const fileInput = document.getElementById('fileInput');
const videoPlayer = document.getElementById('videoPlayer');
const audioVisualizer = document.getElementById('audioVisualizer');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnStop = document.getElementById('btnStop');
const btnLoopToggle = document.getElementById('btnLoopToggle');
const seekBar = document.getElementById('seekBar');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');

// Parameters
const sliderTempo = document.getElementById('sliderTempo');
const valTempo = document.getElementById('valTempo');
const sliderPitch = document.getElementById('sliderPitch');
const valPitch = document.getElementById('valPitch');
const sliderSync = document.getElementById('sliderSync');
const valSync = document.getElementById('valSync');

// Constants
const BUFFER_SIZE = 4096; // Reverted to standard 4096 for stability
let SAMPLE_RATE = 44100;

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    log('App initialized.');
    
    // Initialize AudioContext on user interaction
    document.body.addEventListener('click', () => {
        initAudioContext();
    }, { once: true });
    
    // Event Listeners
    fileInput.addEventListener('change', handleFileSelect);
    btnPlayPause.addEventListener('click', togglePlay);
    btnStop.addEventListener('click', stopPlayback);
    
    // Seek
    seekBar.addEventListener('input', () => {
        if (pitchShifter) {
            const time = (seekBar.value / 100) * pitchShifter.duration;
            seekTo(time);
        }
    });

    // Parameters
    sliderTempo.addEventListener('input', updateParameters);
    sliderPitch.addEventListener('input', updateParameters);
    sliderSync.addEventListener('input', updateSyncUI);

    // Buttons
    document.getElementById('btnTempoReset').addEventListener('click', () => { sliderTempo.value = 1.0; updateParameters(); });
    document.getElementById('btnTempoDown').addEventListener('click', () => { sliderTempo.value = Math.max(0.5, parseFloat(sliderTempo.value) - 0.05); updateParameters(); });
    document.getElementById('btnTempoUp').addEventListener('click', () => { sliderTempo.value = Math.min(2.0, parseFloat(sliderTempo.value) + 0.05); updateParameters(); });

    document.getElementById('btnPitchReset').addEventListener('click', () => { sliderPitch.value = 0; updateParameters(); });
    document.getElementById('btnPitchDown').addEventListener('click', () => { sliderPitch.value = Math.max(-12, parseInt(sliderPitch.value) - 1); updateParameters(); });
    document.getElementById('btnPitchUp').addEventListener('click', () => { sliderPitch.value = Math.min(12, parseInt(sliderPitch.value) + 1); updateParameters(); });

    document.getElementById('btnSyncReset').addEventListener('click', () => { sliderSync.value = 0; updateSyncUI(); });
    document.getElementById('btnSyncDown').addEventListener('click', () => { sliderSync.value = Math.max(-1.0, parseFloat(sliderSync.value) - 0.05); updateSyncUI(); });
    document.getElementById('btnSyncUp').addEventListener('click', () => { sliderSync.value = Math.min(1.0, parseFloat(sliderSync.value) + 0.05); updateSyncUI(); });

    // Loop
    document.getElementById('btnSetA').addEventListener('click', () => {
        if (pitchShifter) {
            loopStart = pitchShifter.timePlayed;
            log(`Loop A Set: ${loopStart.toFixed(2)}`);
        }
    });
    document.getElementById('btnSetB').addEventListener('click', () => {
        if (pitchShifter) {
            loopEnd = pitchShifter.timePlayed;
            isLoopActive = true;
            btnLoopToggle.classList.add('active');
            log(`Loop B Set: ${loopEnd.toFixed(2)}`);
        }
    });
    document.getElementById('btnClearLoop').addEventListener('click', () => {
        loopStart = null;
        loopEnd = null;
        isLoopActive = false;
        btnLoopToggle.classList.remove('active');
        log('Loop Cleared');
    });
    btnLoopToggle.addEventListener('click', () => {
        if (loopStart !== null && loopEnd !== null) {
            isLoopActive = !isLoopActive;
            btnLoopToggle.classList.toggle('active', isLoopActive);
        } else {
            isRepeatAll = !isRepeatAll;
            btnLoopToggle.classList.toggle('active', isRepeatAll);
            log(`Repeat All: ${isRepeatAll}`);
        }
    });

    // Skip
    document.getElementById('btnSkipBack').addEventListener('click', () => {
        if (pitchShifter) seekTo(Math.max(0, pitchShifter.timePlayed - 5));
    });
    document.getElementById('btnSkipFwd').addEventListener('click', () => {
        if (pitchShifter) seekTo(Math.min(pitchShifter.duration, pitchShifter.timePlayed + 5));
    });
    
    // Fullscreen
    document.getElementById('btnFullscreen').addEventListener('click', () => {
        if (videoPlayer.requestFullscreen) videoPlayer.requestFullscreen();
    });
});

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        SAMPLE_RATE = audioCtx.sampleRate;
        log(`AudioContext created. State: ${audioCtx.state}`);
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => log('AudioContext resumed via click.'));
    }
}

// --- File Handling ---

async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    log(`File selected: ${file.name}`);
    initAudioContext();
    stopPlayback();

    const fileURL = URL.createObjectURL(file);
    isVideo = file.type.startsWith('video');

    if (isVideo) {
        videoPlayer.src = fileURL;
        videoPlayer.classList.remove('d-none');
        audioVisualizer.classList.add('d-none');
        document.getElementById('btnFullscreen').classList.remove('d-none');
        videoPlayer.load();
        videoPlayer.muted = true; // Audio handled by Web Audio API
        videoPlayer.playsInline = true;
    } else {
        videoPlayer.classList.add('d-none');
        audioVisualizer.classList.remove('d-none');
        document.getElementById('btnFullscreen').classList.add('d-none');
    }

    // Decode Audio
    try {
        log('Decoding audio...');
        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        // Initialize PitchShifter
        initPitchShifter();
        
        // UI Update
        totalTimeEl.textContent = formatTime(audioBuffer.duration);
        btnPlayPause.disabled = false;
        
        log(`Audio decoded. Duration: ${audioBuffer.duration.toFixed(2)}s`);
    } catch (err) {
        console.error('Error decoding audio:', err);
        log(`Error decoding: ${err.message}`);
        alert('Error loading file. Please try another.');
    }
}

function initPitchShifter() {
    if (pitchShifter) {
        pitchShifter.disconnect();
        pitchShifter = null;
    }

    // Create PitchShifter instance
    pitchShifter = new PitchShifter(audioCtx, audioBuffer, BUFFER_SIZE, () => {
        // onEnd callback
        if (isRepeatAll && !isLoopActive) {
            seekTo(0);
        } else {
        }
    });

    // Setup Event Listeners for Playback Progress
    pitchShifter.on('play', (detail) => {
        // Guard: If stopped/paused, ignore residual events
        if (!isPlaying) return;
        
        updateUI(detail);
        checkLoop(detail.timePlayed);
        if (isVideo && isPlaying) {
            syncVideo(detail.timePlayed);
        }
    });

    updateParameters();
}

// --- Playback Control ---

function togglePlay() {
    if (!audioBuffer) return;

    if (isPlaying) {
        pause();
    } else {
        play();
    }
}

// Dummy driver to force ScriptProcessor to run
let dummySource = null;

async function play() {
    if (!pitchShifter) return;
    
    try {
        log(`Attempting play. Context State: ${audioCtx.state}`);
        
        // Ensure Context is running
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
            log('Context resumed.');
        }
        
        // Connect to output
        pitchShifter.connect(audioCtx.destination);
        log('PitchShifter connected to destination.');
        
        // Create and connect dummy source (Silent Oscillator)
        if (!dummySource) {
            dummySource = audioCtx.createOscillator();
            dummySource.type = 'square';
            dummySource.frequency.value = 0; 
            const silentGain = audioCtx.createGain();
            silentGain.gain.value = 0;
            dummySource.connect(silentGain);
            silentGain.connect(pitchShifter.node); 
            dummySource.start();
            log('Dummy source started.');
        }
        
        if (isVideo) {
            videoPlayer.muted = true;
            videoPlayer.playbackRate = parseFloat(sliderTempo.value);
            // Video will be started by syncVideo to match audio latency
            videoStarted = false;
        }

        isPlaying = true;
        updatePlayButton();
        startVisualizer();
        log('Play sequence complete.');
    } catch (e) {
        log(`Play Error: ${e.message}`);
        console.error(e);
    }
}

function pause() {
    log('Pausing...');
    if (pitchShifter) {
        pitchShifter.disconnect();
    }
    
    // Stop dummy source
    if (dummySource) {
        dummySource.stop();
        dummySource.disconnect();
        dummySource = null;
    }

    if (isVideo) {
        videoPlayer.pause();
        // Clear any pending video start timeout
        if (videoStartTimeout) {
            clearTimeout(videoStartTimeout);
            videoStartTimeout = null;
        }
    }
    isPlaying = false;
    updatePlayButton();
    stopVisualizer();
}

function stopPlayback() {
    log('Stopping...');
    pause();
    if (pitchShifter) {
        pitchShifter.percentagePlayed = 0;
        updateUI({ timePlayed: 0, percentagePlayed: 0 });
    }
    if (isVideo) {
        videoPlayer.currentTime = 0;
    }
    videoStarted = false;
}

function seekTo(time) {
    if (!pitchShifter) return;
    
    const percentage = time / pitchShifter.duration;
    pitchShifter.percentagePlayed = percentage;
    
    if (isVideo) {
        videoPlayer.currentTime = time;
        videoStarted = false; // Reset start trigger
    }
    
    // If paused, update UI immediately
    if (!isPlaying) {
        updateUI({ 
            timePlayed: time, 
            percentagePlayed: percentage * 100 
        });
    }
}

// --- Visualizer (Audio Activity) ---
let visualizerInterval;
const visualizerIcon = document.querySelector('#audioVisualizer i');

function startVisualizer() {
    stopVisualizer();
    // Simple animation to show "activity"
    visualizerIcon.style.transition = 'transform 0.1s';
    visualizerInterval = setInterval(() => {
        if (isPlaying) {
            const scale = 1 + Math.random() * 0.2;
            visualizerIcon.style.transform = `scale(${scale})`;
            visualizerIcon.style.color = '#667eea';
        }
    }, 100);
}

function stopVisualizer() {
    clearInterval(visualizerInterval);
    visualizerIcon.style.transform = 'scale(1)';
    visualizerIcon.style.color = '';
}

// --- Synchronization Logic ---

let videoStarted = false;
let videoStartTimeout = null;

function syncVideo(audioTime) {
    if (!isVideo) return;

    // 1. Start Trigger (First Packet)
    if (!videoStarted) {
        const latency = BUFFER_SIZE / SAMPLE_RATE; // e.g. 4096 / 44100 = 0.092s
        const manualSync = parseFloat(sliderSync.value);
        
        // Delay video start by the latency amount so it matches when audio is actually heard
        const delayMs = Math.max(0, (latency * 1000)); 
        
        log(`Sync Start: AudioTime=${audioTime.toFixed(3)}, Latency=${latency.toFixed(3)}s. Delaying video by ${delayMs.toFixed(0)}ms`);
        
        // Set start time to match audioTime (plus manual sync)
        videoPlayer.currentTime = Math.max(0, audioTime + manualSync);
        
        videoStartTimeout = setTimeout(() => {
            if (isPlaying) {
                videoPlayer.play().catch(e => log(`Video play error: ${e.message}`));
                log('Video started.');
            }
        }, delayMs);
        
        videoStarted = true;
        return;
    }

    // 2. Drift Correction
    const manualSync = parseFloat(sliderSync.value);
    const latency = BUFFER_SIZE / SAMPLE_RATE;
    
    // Target video time = Audio Time - Latency + Manual Offset
    const targetTime = audioTime - latency + manualSync;
    
    const diff = videoPlayer.currentTime - targetTime;

    // If drift is large (> 0.15s), correct it
    if (Math.abs(diff) > 0.15) {
        log(`Sync Correction: Diff ${diff.toFixed(3)}s. Video=${videoPlayer.currentTime.toFixed(3)}, Target=${targetTime.toFixed(3)}`);
        videoPlayer.currentTime = targetTime;
        // Re-apply playback rate just in case seek resets it
        videoPlayer.playbackRate = parseFloat(sliderTempo.value);
    }
}

function checkLoop(time) {
    if (isLoopActive && loopStart !== null && loopEnd !== null) {
        if (time >= loopEnd) {
            seekTo(loopStart);
        }
    }
}

// --- UI Updates ---

function updateUI(detail) {
    const time = detail.timePlayed;
    const pct = detail.percentagePlayed;
    
    currentTimeEl.textContent = formatTime(time);
    seekBar.value = pct;
}

function updatePlayButton() {
    const icon = btnPlayPause.querySelector('i');
    if (isPlaying) {
        icon.classList.remove('bi-play-fill');
        icon.classList.add('bi-pause-fill');
    } else {
        icon.classList.remove('bi-pause-fill');
        icon.classList.add('bi-play-fill');
    }
}

function updateParameters() {
    if (!pitchShifter) return;

    const tempo = parseFloat(sliderTempo.value);
    const pitch = parseInt(sliderPitch.value);

    // Update SoundTouch
    pitchShifter.tempo = tempo;
    pitchShifter.pitchSemitones = pitch;

    // Update Video Speed
    if (isVideo) {
        videoPlayer.playbackRate = tempo;
    }

    // Update UI Labels
    valTempo.textContent = Math.round(tempo * 100) + '%';
    valPitch.textContent = (pitch > 0 ? '+' : '') + pitch;
}

function updateSyncUI() {
    const val = parseFloat(sliderSync.value).toFixed(2);
    valSync.textContent = (val > 0 ? '+' : '') + val + 's';
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
