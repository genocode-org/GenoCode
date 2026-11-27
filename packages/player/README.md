# GenoCode Player

A phone app that only morphs creatures and makes them dance to music. One creature fills the
screen: swipe sideways for the next one, up for all of them and down for the dance styles. The
dance is the web app's own (`@genocode/stage`), so a creature dances the same in both.

Music comes from three demo tracks (grooves GenoCode made itself, in `public/demos/`; see
`scripts/demos.html` to make them again), a song file on the phone, or the
microphone.

## In a browser

```
npm run player                                # while working on it
npm run build -w @genocode/player
npx vite preview --host -w @genocode/player   # the built player, also for phones on the same Wi-Fi
```

The microphone only works on a secure page (`https://` or `localhost`), so not over plain Wi-Fi.

## As a phone app

The app is made with [Capacitor](https://capacitorjs.com): `android/` and `ios/` are the native
projects, and `npm run sync -w @genocode/player` builds the player and copies it into both.

Android, on Linux, with the Android SDK in `~/Android/Sdk` and Java 21:

```
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ANDROID_HOME=$HOME/Android/Sdk
npm run android:apk -w @genocode/player
adb install -r packages/player/android/app/build/outputs/apk/debug/app-debug.apk
```

The iPhone app needs a Mac with Xcode to build and sign.

Links of the form `genocode://open?example=Medusa` or `genocode://open?community=Pesky` open a
creature in the app.
