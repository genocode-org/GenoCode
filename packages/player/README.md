# GenoCode Player

A phone app that only morphs creatures and makes them dance to music. One creature fills the
screen: swipe sideways for the next one, up for all of them and down for the dance styles. The
dance is the web app's own (`@genocode/stage`), so a creature dances the same in both.

Music comes from three demo tracks (instrumentals made with the ACE-Step music model, in
`public/demos/`; `scripts/demos.md` says how), a song file on the phone, or the microphone.

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

To skip the `export` line, tell Gradle once where both are: `sdk.dir=/home/<you>/Android/Sdk` in
`packages/player/android/local.properties` (git ignores it), and
`org.gradle.java.home=/usr/lib/jvm/java-21-openjdk-amd64` in `~/.gradle/gradle.properties` (only
Gradle uses it, so your default Java stays as it is).

## For Google Play

Google Play takes an Android App Bundle (`.aab`) signed with your upload key, not the debug APK.

**Once: make the upload key.** Keep it outside the repo, and keep a backup of it and its password
somewhere safe:

```
mkdir -p ~/keys
keytool -genkeypair -v -keystore ~/keys/genocode-upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then write `packages/player/android/keystore.properties`, which tells the build where the key is
(git ignores this file, and `*.jks` and `*.keystore` files, so none of it gets committed):

```
storeFile=/home/<you>/keys/genocode-upload.jks
storePassword=<the key store's password>
keyAlias=upload
keyPassword=<the key's password>
```

**Each upload:** raise `versionCode` (by 1) in `android/app/build.gradle`, because Google Play
refuses a bundle whose number it already has, and change `versionName` (the version people see,
such as `1.1`). Then, with Java and the SDK found as above:

```
npm run android:aab -w @genocode/player
```

The bundle is `packages/player/android/app/build/outputs/bundle/release/app-release.aab`. Without
`keystore.properties` the release build still works, but the bundle isn't signed and Google Play
won't take it.

**In Play Console** (a developer account costs a one-time fee):

1. Create the app. On the first upload, let Google Play manage the app signing key (Play App
   Signing). Google then signs the app people install, and your key is only the upload key: if you
   lose it, Google can reset it, which it can't do for an app signing key.
2. Upload the bundle to a test track first. Internal testing is quickest, for up to 100 testers you
   name.
3. A personal account created after 13 November 2023 must run a closed test with at least 12 testers
   who stay opted in for 14 days before it can ask for production. Check
   [Google's page](https://support.google.com/googleplay/android-developer/answer/14151465) for
   the current rules.
4. Fill in the store listing, the content rating, the data safety form (the player sends nothing
   anywhere; the microphone is only used on the phone) and a privacy policy link, then send it for
   review.

## On an iPhone

The iPhone app needs a Mac with Xcode to build and sign.

Links of the form `genocode://open?example=Medusa` or `genocode://open?community=Pesky` open a
creature in the app.
