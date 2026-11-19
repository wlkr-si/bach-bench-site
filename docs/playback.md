# Phone playback budget

| Metric | 4G | Slow |
| --- | ---: | ---: |
| First poster | <1,000 ms | <2,500 ms |
| Tap to sound and picture | <500 ms | |
| Swipe to sound and picture | <500 ms | |
| Tap to visible Loading | | <300 ms |
| Playback stalls | 0 | 0 |
| Home and Listen HTML before compression | <60,000 bytes each | <60,000 bytes each |

Run `node scripts/measure.mjs https://bach.wlkr.si` for the public baseline.
Use the preview origin for the candidate. Pass `4g` or `slow` to run one
profile, and an optional directory after it to save a phone-size recording.
Use `npm ci` and an installed Google Chrome. The tool opens and closes its
own Chrome session.

The profiles use 9 Mbps down, 1.5 Mbps up and 170 ms added latency for 4G,
and 1.44 Mbps down, 675 Kbps up and 562.5 ms added latency for slow. Each
profile starts with an empty browser cache and uses the Listen page. It taps
after the first poster decodes and swipes at nine seconds of Clip playback.
The second Piece plays to the end. The poster and loading timings use
animation frames as paint proxies. A presented video frame and unmuted,
decoded audio are desktop proxies for sound and picture. Record actual
iPhone playback separately.

Stage reads the original Vault media. A connection with enough reported
bandwidth can start from a native byte-range request. On a slower or unknown
connection, Stage shows Loading until the full original is buffered. It holds
one Piece ahead and reuses the same player for Safari's per-element playback
permission. Posters are requested as they approach the viewport.
