# The demo tracks

The three tracks in `public/demos/` are instrumentals made with
[ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) (turbo model, 8 steps), in 4/4.
Afterglow was asked for 60 seconds without the 1.7B lyrics and structure model, the others for
70 seconds with it. The tempo in `src/demos.ts` is the one measured in the track.

| Track      | Asked for        | Seed       | Description given                                                                                                                                                      |
| ---------- | ---------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Afterglow  | 122 bpm, A minor | 522614637  | melodic deep house, instrumental, steady four-on-the-floor kick, crisp hi-hats, warm synth chords, plucky lead melody, rounded bass, sunset glow, uplifting, danceable |
| Disco Glow | 118 bpm          | 3119526678 | nu-disco, instrumental, four-on-the-floor, funky bassline, disco strings, sparkly synths, feel-good                                                                    |
| Log Drum   | 112 bpm          | 1855324517 | amapiano, instrumental, log drum bass, shakers, soft piano chords, jazzy, groovy, South African house                                                                  |

Each song ends a few seconds before its file does, so each was cut where the silence starts,
given a 3-second fade before that, brought to about -14 LUFS (a limiter keeps the peaks under
about -1.5 dB) and turned into AAC, which every phone plays:

```
ffmpeg -i Log_Drum.wav -af "atrim=end=65.1,afade=t=out:st=62.1:d=3,volume=2.45dB,\
alimiter=limit=0.6:level=false:attack=1:release=60" \
  -ar 44100 -c:a aac -b:a 160k -movflags +faststart public/demos/Log_Drum.m4a
```
