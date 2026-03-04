// --- app.js (Zero-base rebuild) ---

let audioCtx = null;
let audioBuffer = null;
let pitchShifter = null;
let dummySource = null;

// State
let isPlaying = false;
let isVideo = false;
let currentTempo = 1.0;
let currentPitch = 0; // semitones
let manualSyncOffset = 0.0; // seconds

// Loop State
const LOOP_OFF = 0;
const LOOP_ALL = 1;
const LOOP_AB = 2;
let loopMode = LOOP_OFF;
let loopStart = null;
let loopEnd = null;

// Animation Frame ID
let rAF_ID = null;

// DOM Elements
const fileInput = document.getElementById('fileInput');
const videoSelector = document.getElementById('videoSelector');
const videoPlayer = document.getElementById('videoPlayer');
const audioVisualizer = document.getElementById('audioVisualizer');
const noFileMsg = document.getElementById('noFileMsg');
const btnFullscreenToggle = document.getElementById('btnFullscreenToggle');
const mediaContainer = document.getElementById('mediaContainer');

// Controls
const seekSlider = document.getElementById('seekSlider');
const timeCurrent = document.getElementById('timeCurrent');
const timeTotal = document.getElementById('timeTotal');

// Buttons
const btnPlayPause = document.getElementById('btnPlayPause');
const iconPlay = document.getElementById('iconPlay');
const btnSkipBack = document.getElementById('btnSkipBack');
const btnSkipFwd = document.getElementById('btnSkipFwd');

// Loop Buttons
const btnLoopMode = document.getElementById('btnLoopMode');
const iconLoopMode = document.getElementById('iconLoopMode');
const btnSetA = document.getElementById('btnSetA');
const btnSetB = document.getElementById('btnSetB');
const btnClearLoop = document.getElementById('btnClearLoop');
const loopOverlay = document.getElementById('loopOverlay');
const loopA_Disp = document.getElementById('loopA');
const loopB_Disp = document.getElementById('loopB');

// Sliders
const sliderTempo = document.getElementById('sliderTempo');
const valTempo = document.getElementById('valTempo');
const btnResetTempo = document.getElementById('btnResetTempo');

const sliderPitch = document.getElementById('sliderPitch');
const valPitch = document.getElementById('valPitch');
const btnResetPitch = document.getElementById('btnResetPitch');

const sliderSync = document.getElementById('sliderSync');
const valSync = document.getElementById('valSync');
const btnResetSync = document.getElementById('btnResetSync');
const btnSyncMinus = document.getElementById('btnSyncMinus');
const btnSyncPlus = document.getElementById('btnSyncPlus');

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    // Requires user interaction to start AudioContext
    document.body.addEventListener('click', initAudioContext, { once: true });
    document.body.addEventListener('touchstart', initAudioContext, { once: true });

    loadVideoList();

    fileInput.addEventListener('change', handleFileLoad);
    videoSelector.addEventListener('change', handleRemoteVideoSelect);

    // Fullscreen Toggle
    btnFullscreenToggle.addEventListener('click', toggleFullscreen);

    // Playback
    btnPlayPause.addEventListener('click', togglePlay);
    btnSkipBack.addEventListener('click', () => skipTime(-5));
    btnSkipFwd.addEventListener('click', () => skipTime(5));

    // Seek
    seekSlider.addEventListener('input', (e) => {
        if (!pitchShifter) return;
        const perc = parseFloat(e.target.value) / 100;
        const targetTime = perc * pitchShifter.duration;
        seekTo(targetTime);
    });

    // Tempo
    sliderTempo.addEventListener('input', (e) => setTempo(parseFloat(e.target.value)));
    btnResetTempo.addEventListener('click', () => setTempo(1.0));

    // Pitch
    sliderPitch.addEventListener('input', (e) => setPitch(parseInt(e.target.value, 10)));
    btnResetPitch.addEventListener('click', () => setPitch(0));

    // Sync
    sliderSync.addEventListener('input', (e) => setSyncOffset(parseFloat(e.target.value)));
    btnResetSync.addEventListener('click', () => setSyncOffset(0.0));
    btnSyncMinus.addEventListener('click', () => setSyncOffset(manualSyncOffset - 0.05));
    btnSyncPlus.addEventListener('click', () => setSyncOffset(manualSyncOffset + 0.05));

    // Loop
    btnLoopMode.addEventListener('click', toggleLoopMode);
    btnSetA.addEventListener('click', () => {
        if (!pitchShifter) return;
        loopStart = pitchShifter.timePlayed;
        loopA_Disp.textContent = formatTime(loopStart);
        btnSetA.classList.add('active');
        checkLoopState();
    });
    btnSetB.addEventListener('click', () => {
        if (!pitchShifter) return;
        loopEnd = pitchShifter.timePlayed;
        loopB_Disp.textContent = formatTime(loopEnd);
        btnSetB.classList.add('active');
        checkLoopState();
    });
    btnClearLoop.addEventListener('click', clearABLoop);
});

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// --- File Handling ---
async function handleFileLoad(e) {
    const file = e.target.files[0];
    if (!file) return;

    initAudioContext();
    stopPlayback(); // Stop any current playback

    noFileMsg.classList.add('d-none');

    // Check if video
    isVideo = file.type.startsWith('video');
    const fileUrl = URL.createObjectURL(file);

    if (isVideo) {
        videoPlayer.src = fileUrl;
        videoPlayer.muted = true; // Audio is handled by WebAudio independently
        videoPlayer.classList.remove('d-none');
        btnFullscreenToggle.classList.remove('d-none');
        audioVisualizer.classList.add('d-none');
        videoPlayer.load();
    } else {
        videoPlayer.classList.add('d-none');
        btnFullscreenToggle.classList.add('d-none');
        audioVisualizer.classList.remove('d-none');
    }

    // Decode Audio Data
    try {
        const arrayBuffer = await file.arrayBuffer();
        await loadAudioData(arrayBuffer);
    } catch (err) {
        alert("Failed to decode audio data.");
        console.error(err);
    }
}

// Loads a video from the remote 'videos/' directory
async function handleRemoteVideoSelect(e) {
    const filename = e.target.value;
    if (!filename) return;

    // Reset local UI if picking from network
    fileInput.value = '';

    initAudioContext();
    stopPlayback();
    noFileMsg.classList.add('d-none');

    isVideo = true;
    const remoteUrl = `videos/${filename}`;

    // Set video src directly
    videoPlayer.src = remoteUrl;
    videoPlayer.muted = true;
    videoPlayer.classList.remove('d-none');
    btnFullscreenToggle.classList.remove('d-none');
    audioVisualizer.classList.add('d-none');
    videoPlayer.load();

    // Fetch same video data for WebAudio processing
    try {
        const response = await fetch(remoteUrl);
        if (!response.ok) throw new Error("Network response was not ok");
        const arrayBuffer = await response.arrayBuffer();
        await loadAudioData(arrayBuffer);
    } catch (err) {
        alert("Failed to fetch remote audio data.");
        console.error(err);
    }
}

async function loadAudioData(arrayBuffer) {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    setupPitchShifter();

    timeTotal.textContent = formatTime(audioBuffer.duration);
    seekSlider.disabled = false;
    btnPlayPause.disabled = false;
    clearABLoop();
    setLoopMode(LOOP_OFF);
}

// Fetch list of available videos downloaded via main.py
async function loadVideoList() {
    try {
        const resp = await fetch('video_list.json');
        if (!resp.ok) return; // likely doesn't exist yet/empty
        const list = await resp.json();

        list.forEach(item => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = item;
            videoSelector.appendChild(opt);
        });
    } catch (e) {
        console.warn("Failed loading video list. Possibly not generated yet.", e);
    }
}

// --- Fullscreen Handling (Container Expand Approach) ---
// Using HTML5 Fullscreen API on the media container to keep controls logic fully alive underneath.
async function toggleFullscreen() {
    if (!document.fullscreenElement) {
        if (mediaContainer.requestFullscreen) {
            await mediaContainer.requestFullscreen();
        } else if (mediaContainer.webkitRequestFullscreen) { /* Safari */
            await mediaContainer.webkitRequestFullscreen();
        } else if (mediaContainer.msRequestFullscreen) { /* IE11 */
            await mediaContainer.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            await document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
            await document.msExitFullscreen();
        }
    }
}

// Update icon and screen orientation based on fullscreen state
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('msfullscreenchange', handleFullscreenChange);

async function handleFullscreenChange() {
    const icon = btnFullscreenToggle.querySelector('i');
    if (document.fullscreenElement) {
        icon.classList.replace('bi-arrows-fullscreen', 'bi-fullscreen-exit');
        // Lock screen to landscape if supported
        if (screen.orientation && screen.orientation.lock) {
            try {
                await screen.orientation.lock('landscape');
            } catch (err) {
                console.warn('Screen orientation lock failed or not supported:', err);
            }
        }
    } else {
        icon.classList.replace('bi-fullscreen-exit', 'bi-arrows-fullscreen');
        // Unlock screen orientation
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }
}


function setupPitchShifter() {
    if (pitchShifter) {
        pitchShifter.disconnect();
        pitchShifter = null;
    }

    // Initialize from soundtouch.js
    // bufferSize: 4096 is a good balance of latency and performance
    pitchShifter = new PitchShifter(audioCtx, audioBuffer, 4096, () => {
        // onEnd callback (track finished)
        if (loopMode === LOOP_ALL) {
            seekTo(0);
        } else if (loopMode === LOOP_AB && loopStart !== null) {
            seekTo(loopStart);
        } else {
            pausePlayback();
            seekTo(0);
        }
    });

    // Apply current slider settings immediately
    pitchShifter.tempo = currentTempo;
    pitchShifter.pitchSemitones = currentPitch;
}


// --- Playback Control ---
async function togglePlay() {
    if (!pitchShifter) return;
    if (isPlaying) {
        pausePlayback();
    } else {
        await startPlayback();
    }
}

async function startPlayback() {
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    pitchShifter.connect(audioCtx.destination);

    // Web Audio limitation: ScriptProcessorNode sometimes stalls in some browsers
    // if there are no active input nodes. 
    // We bind a silent oscillator to ensure the graph keeps rendering.
    if (!dummySource) {
        dummySource = audioCtx.createOscillator();
        const silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;
        dummySource.connect(silentGain);
        silentGain.connect(pitchShifter.node);
        dummySource.start();
    }

    if (isVideo) {
        videoPlayer.playbackRate = currentTempo;
        videoPlayer.play().catch(e => console.warn(e));
    }

    isPlaying = true;
    iconPlay.classList.replace('bi-play-fill', 'bi-pause-fill');
    audioVisualizer.classList.add('is-playing');

    // Start Master Sync & UI render loop
    if (rAF_ID) cancelAnimationFrame(rAF_ID);
    rAF_ID = requestAnimationFrame(masterSyncLoop);
}

function pausePlayback() {
    if (pitchShifter) {
        pitchShifter.disconnect();
    }
    if (dummySource) {
        dummySource.stop();
        dummySource.disconnect();
        dummySource = null;
    }
    if (isVideo) {
        videoPlayer.pause();
    }

    isPlaying = false;
    iconPlay.classList.replace('bi-pause-fill', 'bi-play-fill');
    audioVisualizer.classList.remove('is-playing');

    if (rAF_ID) {
        cancelAnimationFrame(rAF_ID);
        rAF_ID = null;
    }
}

function stopPlayback() {
    pausePlayback();
    if (pitchShifter) {
        seekTo(0);
    }
}

function seekTo(timeInSeconds) {
    if (!pitchShifter) return;

    // clamp bounds
    let t = Math.max(0, Math.min(timeInSeconds, pitchShifter.duration));
    pitchShifter.percentagePlayed = t / pitchShifter.duration;

    if (isVideo) {
        const targetVideoTime = t + manualSyncOffset;
        videoPlayer.currentTime = Math.max(0, targetVideoTime);
        forceSyncNextFrame = true; // Added
    }

    updateUI(t);
}

function skipTime(delta) {
    if (!pitchShifter) return;
    seekTo(pitchShifter.timePlayed + delta);
}

// --- Advanced Timing & Sync State ---
let lastAudioPos = 0;
let lastAudioUpdatePerf = 0;
let forceSyncNextFrame = false;

// --- Master Clock Sync Loop ---
// Ensures Video exactly syncs with Audio, resolving Guitar practice frustrations.
function masterSyncLoop() {
    if (!isPlaying || !pitchShifter) return;

    // 1. Get Smoothed Audio Time (Interpolation)
    // Audio clock updates in chunks (about every ~93ms). 
    // We interpolate between updates using performance.now() for 60fps smoothness.
    const rawAudioTime = pitchShifter.timePlayed;
    const now = performance.now();

    if (rawAudioTime !== lastAudioPos) {
        lastAudioPos = rawAudioTime;
        lastAudioUpdatePerf = now;
    }

    // Calculate interpolated time: time since last chunk update * current speed
    const timeSinceUpdate = (now - lastAudioUpdatePerf) / 1000;
    const smoothAudioTime = rawAudioTime + (timeSinceUpdate * currentTempo);

    // 2. Check A-B Loop boundaries (use smooth time for precise triggers)
    checkABLoop(smoothAudioTime);

    // 3. Sync Video to Audio (Audio is Master)
    if (isVideo) {
        const targetVideoTime = smoothAudioTime + manualSyncOffset;
        const diff = videoPlayer.currentTime - targetVideoTime;
        const absDiff = Math.abs(diff);

        // Continuous playback rate alignment
        if (Math.abs(videoPlayer.playbackRate - currentTempo) > 0.01) {
            videoPlayer.playbackRate = currentTempo;
        }

        // SYNC STRATEGY:
        // - If forceSyncNextFrame is true (loops, seeks), sync immediately.
        // - If drift > 0.3s (relaxed threshold), force sync. 
        // - Otherwise, let the video's natural clock keep things smooth.
        if (forceSyncNextFrame || absDiff > 0.3) {
            videoPlayer.currentTime = Math.max(0, targetVideoTime);
            forceSyncNextFrame = false;
        }
    }

    // 4. Update Status UI
    updateUI(smoothAudioTime);

    rAF_ID = requestAnimationFrame(masterSyncLoop);
}

function updateUI(timeInSeconds) {
    timeCurrent.textContent = formatTime(timeInSeconds);
    if (!seekSlider.matches(':active')) { // only update slider if user isn't dragging it
        seekSlider.value = pitchShifter ? (timeInSeconds / pitchShifter.duration) * 100 : 0;
    }
}

// --- A-B Loop Logic ---
function toggleLoopMode() {
    loopMode = (loopMode + 1) % 3;
    setLoopMode(loopMode);
}

function setLoopMode(mode) {
    loopMode = mode;
    iconLoopMode.className = 'bi'; // reset
    btnLoopMode.classList.remove('btn-outline-secondary', 'btn-primary', 'btn-info', 'active');

    if (mode === LOOP_OFF) {
        iconLoopMode.classList.add('bi-repeat');
        btnLoopMode.classList.add('btn-outline-secondary');
    } else if (mode === LOOP_ALL) {
        iconLoopMode.classList.add('bi-repeat');
        btnLoopMode.classList.add('btn-primary');
    } else if (mode === LOOP_AB) {
        iconLoopMode.classList.add('bi-repeat-1');
        btnLoopMode.classList.add('btn-info', 'active');

        // Failsafe: if enabling AB but not set, guess reasonable defaults
        if (loopStart === null) loopStart = 0;
        if (loopEnd === null && pitchShifter) loopEnd = pitchShifter.duration;
        updateLoopOverlay();
    }
}

function checkABLoop(currentTime) {
    if (loopMode === LOOP_AB && loopStart !== null && loopEnd !== null) {
        // Trigger loop reset if we hit or exceed the B marker
        if (currentTime >= loopEnd) {
            seekTo(loopStart);
            forceSyncNextFrame = true; // Added
        }
    }
}

function checkLoopState() {
    if (loopStart !== null && loopEnd !== null) {
        // Validate A < B, swap if inverted
        if (loopStart >= loopEnd) {
            let temp = loopStart;
            loopStart = loopEnd;
            loopEnd = temp;
            loopA_Disp.textContent = formatTime(loopStart);
            loopB_Disp.textContent = formatTime(loopEnd);
        }
        btnClearLoop.disabled = false;
        loopOverlay.classList.remove('d-none');
        setLoopMode(LOOP_AB); // Auto-activate AB loop
    } else {
        btnClearLoop.disabled = true;
        loopOverlay.classList.add('d-none');
    }
}

function clearABLoop() {
    loopStart = null;
    loopEnd = null;
    btnSetA.classList.remove('active');
    btnSetB.classList.remove('active');
    loopA_Disp.textContent = '--:--';
    loopB_Disp.textContent = '--:--';
    btnClearLoop.disabled = true;
    loopOverlay.classList.add('d-none');
    if (loopMode === LOOP_AB) {
        setLoopMode(LOOP_OFF);
    }
}

function updateLoopOverlay() {
    if (loopMode === LOOP_AB && loopStart !== null && loopEnd !== null) {
        loopA_Disp.textContent = formatTime(loopStart);
        loopB_Disp.textContent = formatTime(loopEnd);
        loopOverlay.classList.remove('d-none');
    }
}

// --- Parameter Adjustments ---
function setTempo(val) {
    // Clamp 0.5 - 1.2
    currentTempo = Math.max(0.5, Math.min(1.2, val));
    sliderTempo.value = currentTempo;
    valTempo.textContent = Math.round(currentTempo * 100) + '%';

    // Indepnedent Control via soundtouch.js
    if (pitchShifter) {
        pitchShifter.tempo = currentTempo;
    }
    // Video rate sync is implicitly handled in masterSyncLoop
}

function setPitch(st) {
    // Clamp -4 to +4
    currentPitch = Math.max(-4, Math.min(4, st));
    sliderPitch.value = currentPitch;
    valPitch.textContent = (currentPitch > 0 ? '+' : '') + currentPitch + ' st';

    // Indepnedent Control via soundtouch.js
    if (pitchShifter) {
        pitchShifter.pitchSemitones = currentPitch;
    }
}

function setSyncOffset(sec) {
    // Clamp -1.0 to 1.0 seconds range
    manualSyncOffset = Math.max(-1.0, Math.min(1.0, sec));
    sliderSync.value = manualSyncOffset.toFixed(2);
    valSync.textContent = (manualSyncOffset >= 0 ? '+' : '') + manualSyncOffset.toFixed(2) + 's';

    // Apply immediate sync correction if already playing
    if (isPlaying && isVideo && pitchShifter) {
        const targetVideoTime = pitchShifter.timePlayed + manualSyncOffset;
        videoPlayer.currentTime = Math.max(0, targetVideoTime);
    }
}

// --- Utils ---
function formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00.0';
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const sInt = Math.floor(s);
    const ms = Math.floor((s - sInt) * 10); // 1 decimal place format

    return `${m.toString().padStart(2, '0')}:${sInt.toString().padStart(2, '0')}.${ms}`;
}