# Web Audio Player

A high-performance web-based audio/video player with advanced playback controls, designed for musicians and transcribers.
Hosted on GitHub Pages: [https://tencyo-sama.github.io/audio-player/](https://tencyo-sama.github.io/audio-player/)

## Features

*   **Independent Tempo & Pitch Control**:
    *   Adjust Tempo (50% - 120%) without affecting pitch.
    *   Adjust Pitch (-4 to +4 semitones) without affecting tempo.
    *   Powered by a custom integration of the SoundTouchJS library.
*   **Video Support**:
    *   Plays MP4 files with precise Audio/Video synchronization.
    *   Automatic latency compensation and manual A/V sync adjustment.
*   **Looping Tools**:
    *   **A-B Loop**: Set specific start (A) and end (B) points.
    *   **Repeat All**: Loop the entire track.
*   **Visualizer**: Simple visual feedback to confirm audio processing.
*   **Responsive UI**: Built with Bootstrap 5, featuring a dark mode interface suitable for long sessions.

## Usage

1.  **Load Media**: Click the file input in the header to select an MP3, WAV, or MP4 file.
2.  **Play**: Click the large Play button.
3.  **Adjust**: Use the sliders to change Tempo, Pitch, or A/V Sync.
4.  **Loop**: Use "Set A" and "Set B" to define a loop region.

## Tech Stack

*   HTML5 / CSS3 / JavaScript (ES6+)
*   [Bootstrap 5](https://getbootstrap.com/)
*   [SoundTouchJS](https://github.com/jakubfiala/soundtouch-js) (Modified for browser usage)
*   Web Audio API

## License

MIT
