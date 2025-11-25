/**
 * Web Audio Player - Wide Range Manual Sync
 */

// --- Debug Logging ---
function log(msg) {
    // console.log(msg); 
}

// --- Global Variables ---
let audioCtx;
let soundTouch;
let pitchShifter;
let audioBuffer;
let isPlaying = false;
let isVideo = false;
let dummySource = null;

// Playback State
let loopStart = null;
let loopEnd = null;

// Loop Mode
const LOOP_OFF = 0;
const LOOP_ALL = 1;
const LOOP_AB = 2;
let loopMode = LOOP_OFF;

// Sync Constants
// 固定遅延補正を廃止します。全てスライダー（manualOffset）で調整します。
const BUFFER_SIZE = 4096;
let SAMPLE_RATE = 44100;

// DOM Elements
const fileInput = document.getElementById('fileInput');
const videoPlayer = document.getElementById('videoPlayer');
const audioVisualizer = document.getElementById('audioVisualizer');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnStop = document.getElementById('btnStop');
const seekBar = document.getElementById('seekBar');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const btnFullscreen = document.getElementById('btnFullscreen');

// Loop UI
const btnLoopToggle = document.getElementById('btnLoopToggle');
const iconLoop = document.getElementById('iconLoop');
const btnSetA = document.getElementById('btnSetA');
const btnSetB = document.getElementById('btnSetB');
const btnClearLoop = document.getElementById('btnClearLoop');
const loopInfoOverlay = document.getElementById('loopInfoOverlay');
const loopStartDisplay = document.getElementById('loopStartDisplay');
const loopEndDisplay = document.getElementById('loopEndDisplay');

// Parameters
let currentTempo = 1.0;
let currentPitch = 0;
const valTempo = document.getElementById('valTempo');
const valPitch = document.getElementById('valPitch');

// Sync UI
const sliderSync = document.getElementById('sliderSync');
const valSync = document.getElementById('valSync');
const toggleSyncCorrection = document.getElementById('toggleSyncCorrection');
const btnSyncFineDown = document.getElementById('btnSyncFineDown');
const btnSyncFineUp = document.getElementById('btnSyncFineUp');
const btnSyncBigDown = document.getElementById('btnSyncBigDown');
const btnSyncBigUp = document.getElementById('btnSyncBigUp');

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    
    document.body.addEventListener('click', () => {
        initAudioContext();
    }, { once: true });
    
    fileInput.addEventListener('change', handleFileSelect);
    btnPlayPause.addEventListener('click', togglePlay);
    btnStop.addEventListener('click', stopPlayback);
    
    // Seek
    seekBar.addEventListener('input', () => {
        if (pitchShifter && pitchShifter.duration > 0) {
            const time = (seekBar.value / 100) * pitchShifter.duration;
            seekTo(time);
        }
    });

    // Tempo / Pitch Controls
    document.getElementById('btnTempoReset').addEventListener('click', () => { currentTempo = 1.0; updateParameters(); });
    document.getElementById('btnTempoDown').addEventListener('click', () => { currentTempo = Math.max(0.5, currentTempo - 0.05); updateParameters(); });
    document.getElementById('btnTempoUp').addEventListener('click', () => { currentTempo = Math.min(2.0, currentTempo + 0.05); updateParameters(); });

    document.getElementById('btnPitchReset').addEventListener('click', () => { currentPitch = 0; updateParameters(); });
    document.getElementById('btnPitchDown').addEventListener('click', () => { currentPitch = Math.max(-12, currentPitch - 1); updateParameters(); });
    document.getElementById('btnPitchUp').addEventListener('click', () => { currentPitch = Math.min(12, currentPitch + 1); updateParameters(); });

    // --- Sync Slider Logic (Wide Range) ---
    // HTMLで min="-20" max="20" に設定済み
    const updateSyncVal = (val) => {
        // 範囲制限
        let v = parseFloat(val);
        if (v < -20) v = -20;
        if (v > 20) v = 20;
        sliderSync.value = v;
        updateSyncUI();
    };

    sliderSync.addEventListener('input', () => updateSyncUI());
    
    // Fine Tune (+- 0.05)
    btnSyncFineDown.addEventListener('click', () => {
        let v = parseFloat(sliderSync.value);
        updateSyncVal((v - 0.05).toFixed(2));
    });
    btnSyncFineUp.addEventListener('click', () => {
        let v = parseFloat(sliderSync.value);
        updateSyncVal((v + 0.05).toFixed(2));
    });

    // Big Tune (+- 1.0)
    btnSyncBigDown.addEventListener('click', () => {
        let v = parseFloat(sliderSync.value);
        updateSyncVal((v - 1.0).toFixed(2));
    });
    btnSyncBigUp.addEventListener('click', () => {
        let v = parseFloat(sliderSync.value);
        updateSyncVal((v + 1.0).toFixed(2));
    });

    // Loop Buttons
    btnSetA.addEventListener('click', () => {
        if (pitchShifter) {
            loopStart = pitchShifter.timePlayed;
            btnSetA.classList.remove('btn-outline-info');
            btnSetA.classList.add('btn-info');
            loopStartDisplay.textContent = formatTime(loopStart);
            updateLoopOverlay();
            if (loopEnd !== null) setLoopMode(LOOP_AB);
        }
    });

    btnSetB.addEventListener('click', () => {
        if (pitchShifter) {
            loopEnd = pitchShifter.timePlayed;
            btnSetB.classList.remove('btn-outline-info');
            btnSetB.classList.add('btn-info');
            loopEndDisplay.textContent = formatTime(loopEnd);
            updateLoopOverlay();
            if (loopStart !== null) setLoopMode(LOOP_AB);
        }
    });

    btnClearLoop.addEventListener('click', () => {
        loopStart = null;
        loopEnd = null;
        btnSetA.classList.add('btn-outline-info');
        btnSetA.classList.remove('btn-info');
        btnSetB.classList.add('btn-outline-info');
        btnSetB.classList.remove('btn-info');
        loopStartDisplay.textContent = "--:--";
        loopEndDisplay.textContent = "--:--";
        updateLoopOverlay();
        if (loopMode === LOOP_AB) setLoopMode(LOOP_OFF);
    });
    
    btnLoopToggle.addEventListener('click', () => {
        let nextMode = loopMode + 1;
        if (nextMode === LOOP_AB && (loopStart === null || loopEnd === null)) nextMode = LOOP_OFF;
        else if (nextMode > LOOP_AB) nextMode = LOOP_OFF;
        setLoopMode(nextMode);
    });

    // Skips
    document.getElementById('btnSkipBack').addEventListener('click', () => {
        if (!pitchShifter) return;
        let t = pitchShifter.timePlayed - 5;
        if (t < 0) t = 0;
        seekTo(t);
    });
    
    document.getElementById('btnSkipFwd').addEventListener('click', () => {
        if (!pitchShifter) return;
        let t = pitchShifter.timePlayed + 5;
        if (t > pitchShifter.duration) t = pitchShifter.duration;
        seekTo(t);
    });
    
    // Fullscreen
    btnFullscreen.addEventListener('click', () => {
        if (!videoPlayer) return;
        if (videoPlayer.requestFullscreen) videoPlayer.requestFullscreen();
        else if (videoPlayer.webkitRequestFullscreen) videoPlayer.webkitRequestFullscreen();
        else if (videoPlayer.msRequestFullscreen) videoPlayer.msRequestFullscreen();
    });
});

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        SAMPLE_RATE = audioCtx.sampleRate;
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// --- File Handling ---

async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    initAudioContext();
    stopPlayback();
    
    // Reset Sync Slider on new file load to 0
    // Or keep it? Let's reset it to be safe.
    sliderSync.value = 0;
    updateSyncUI();

    const fileURL = URL.createObjectURL(file);
    isVideo = file.type.startsWith('video');

    if (isVideo) {
        videoPlayer.src = fileURL;
        videoPlayer.classList.remove('d-none');
        audioVisualizer.classList.add('d-none');
        btnFullscreen.classList.remove('d-none');
        
        // ECHO FIX
        videoPlayer.muted = true;
        videoPlayer.volume = 0;
        videoPlayer.playsInline = true;
        
        videoPlayer.load();
    } else {
        videoPlayer.classList.add('d-none');
        audioVisualizer.classList.remove('d-none');
        btnFullscreen.classList.add('d-none');
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        initPitchShifter();
        totalTimeEl.textContent = formatTime(audioBuffer.duration);
        btnPlayPause.disabled = false;
        setLoopMode(LOOP_OFF);
    } catch (err) {
        console.error('Error decoding audio:', err);
        alert('Error loading file.');
    }
}

function initPitchShifter() {
    if (pitchShifter) {
        pitchShifter.disconnect();
        pitchShifter = null;
    }

    pitchShifter = new PitchShifter(audioCtx, audioBuffer, BUFFER_SIZE, () => {
        // onEnd
        if (loopMode === LOOP_ALL) {
            seekTo(0);
        } else if (loopMode === LOOP_AB && loopStart !== null) {
            seekTo(loopStart);
        } else {
            pause();
            seekTo(0);
        }
    });

    pitchShifter.on('play', (detail) => {
        if (!isPlaying) return;
        updateUI(detail);
        checkLoop(detail.timePlayed);
        
        if (isVideo) {
            syncVideo(detail.timePlayed);
        }
    });

    updateParameters();
}

// --- Loop Logic ---
function setLoopMode(mode) {
    loopMode = mode;
    btnLoopToggle.classList.remove('btn-outline-secondary', 'btn-outline-light', 'btn-primary', 'active');
    iconLoop.classList.remove('bi-repeat', 'bi-repeat-1', 'bi-arrow-repeat');

    switch (mode) {
        case LOOP_OFF:
            btnLoopToggle.classList.add('btn-outline-secondary');
            iconLoop.classList.add('bi-repeat');
            break;
        case LOOP_ALL:
            btnLoopToggle.classList.add('btn-primary');
            iconLoop.classList.add('bi-repeat');
            break;
        case LOOP_AB:
            btnLoopToggle.classList.add('btn-info');
            iconLoop.classList.add('bi-arrow-repeat');
            break;
    }
}

function updateLoopOverlay() {
    if (loopStart !== null || loopEnd !== null) {
        loopInfoOverlay.classList.remove('d-none');
    } else {
        loopInfoOverlay.classList.add('d-none');
    }
}

function checkLoop(time) {
    if (loopMode === LOOP_AB && loopStart !== null && loopEnd !== null) {
        if (time >= loopEnd) {
            seekTo(loopStart);
        }
    }
}

// --- Playback ---

function togglePlay() {
    if (!audioBuffer) return;
    if (isPlaying) pause();
    else play();
}

async function play() {
    if (!pitchShifter) return;
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    
    pitchShifter.connect(audioCtx.destination);
    
    if (!dummySource) {
        dummySource = audioCtx.createOscillator();
        dummySource.type = 'square';
        dummySource.frequency.value = 0; 
        const silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;
        dummySource.connect(silentGain);
        silentGain.connect(pitchShifter.node); 
        dummySource.start();
    }
    
    if (isVideo) {
        videoPlayer.muted = true;
        videoPlayer.volume = 0;
        videoPlayer.playbackRate = currentTempo;
        videoPlayer.play().catch(e => console.log(e));
    }

    isPlaying = true;
    updatePlayButton();
    startVisualizer();
}

function pause() {
    if (pitchShifter) pitchShifter.disconnect();
    if (dummySource) {
        dummySource.stop();
        dummySource.disconnect();
        dummySource = null;
    }
    if (isVideo) videoPlayer.pause();
    isPlaying = false;
    updatePlayButton();
    stopVisualizer();
}

function stopPlayback() {
    pause();
    if (pitchShifter) {
        pitchShifter.percentagePlayed = 0;
        updateUI({ timePlayed: 0, percentagePlayed: 0 });
    }
    if (isVideo) videoPlayer.currentTime = 0;
}

function seekTo(time) {
    if (!pitchShifter) return;
    
    const percentage = time / pitchShifter.duration;
    pitchShifter.percentagePlayed = percentage;
    
    if (isVideo) {
        const manualOffset = parseFloat(sliderSync.value);
        // Video Target = Audio Read Head + Manual Offset
        const targetVidTime = Math.max(0, time + manualOffset);
        videoPlayer.currentTime = targetVidTime;
    }
    
    if (!isPlaying) {
        updateUI({ timePlayed: time, percentagePlayed: percentage * 100 });
    }
}

// --- Sync Logic (Simplified & Wide Range) ---

function syncVideo(audioReadTime) {
    if (!isVideo || !toggleSyncCorrection.checked) return;

    const manualOffset = parseFloat(sliderSync.value);
    
    // 目標時間 = 音声読み込み位置 + スライダー補正値
    // 固定のBASE_LATENCYは排除しました。スライダーが全てです。
    const targetTime = audioReadTime + manualOffset;
    
    const diff = videoPlayer.currentTime - targetTime;

    // 0.1秒以上のズレで補正
    if (Math.abs(diff) > 0.1) {
        videoPlayer.currentTime = Math.max(0, targetTime);
        if (videoPlayer.playbackRate !== currentTempo) {
            videoPlayer.playbackRate = currentTempo;
        }
    }
}

// --- Visualizer & Utils ---

let visualizerInterval;
const visualizerIcon = document.querySelector('#audioVisualizer i');

function startVisualizer() {
    stopVisualizer();
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

function updateUI(detail) {
    currentTimeEl.textContent = formatTime(detail.timePlayed);
    seekBar.value = detail.percentagePlayed;
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
    pitchShifter.tempo = currentTempo;
    pitchShifter.pitchSemitones = currentPitch;
    if (isVideo) videoPlayer.playbackRate = currentTempo;
    valTempo.textContent = Math.round(currentTempo * 100) + '%';
    valPitch.textContent = (currentPitch > 0 ? '+' : '') + currentPitch;
}

function updateSyncUI() {
    const val = parseFloat(sliderSync.value).toFixed(2);
    valSync.textContent = (val > 0 ? '+' : '') + val + 's';
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}