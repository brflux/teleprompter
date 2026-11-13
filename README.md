# Live-camera teleprompter

Live at https://brflux.github.io/teleprompter/

A single-page teleprompter. The script scrolls over your live camera and, by default, follows your voice as you speak. You can also switch to a steady auto-scroll. Works as a static site: `index.html` plus `follow.js`.

## Use it

1. Open the page at an **https** URL (required for camera and speech on iPhone Safari; a local file will not work).
2. Tap **Start camera** and allow the camera and microphone.
3. The front camera and **voice follow** start by default. Tap the video to play or pause, or use the on-screen buttons.
4. Open **Script** to paste your copy. It is saved in the browser.
5. **Flip** switches front and back cameras. **Rec** records the camera and microphone (MP4 on iOS when the browser supports it, WebM elsewhere). Share or download the take when you stop.
6. Drag the text to re-anchor if you skip around; voice-follow will pick up from that line.
7. If voice-follow is unavailable, switch to **Auto-scroll** and set speed with the slider.
8. **Fill** crops the camera to cover the screen; **Fit** shows the whole frame (letterboxed). The choice is remembered.
9. In landscape, the script still scrolls vertically, but the text is wider and the controls sit in a compact side rail (Setup and Hide). Font size is remembered separately for portrait and landscape.
10. To avoid Safari’s tab bar shrinking the screen, open Share and choose **Add to Home Screen**. The app opens on its own, without browser chrome.

## Voice follow

The matcher lives in `follow.js` and is unit-tested in `follow.test.js`:

```bash
node follow.test.js
```

It uses interim speech results when they exist, matches a sliding window of recent words against a lookahead window of the script, tolerates skips, repeats, and ad-libs, will not rewind on a weak match, and can re-sync forward when you say a distinctive later phrase. Recognition is restarted aggressively when Safari ends a session.

## iPhone notes

- The page must be https.
- The preview video uses `playsinline` and `muted` so Safari will show the live camera.
- Voice-follow uses the Web Speech API (`webkitSpeechRecognition`). It needs a network connection and a microphone permission. It is flakier in Safari than in desktop Chrome: sessions often end after a clause or a short pause. This page restarts listening automatically, but you may still see a brief gap.
- Recording and dictation both want the microphone; follow may hitch during a recorded take.
- If dictation is blocked or missing, auto-scroll is the fallback.

## Hosting

Live at https://brflux.github.io/teleprompter/. The source is in this repository, served by GitHub Pages from the `main` branch root. A custom domain can be added later with one DNS record and one Pages setting.
