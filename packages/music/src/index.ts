// Turns music into the inputs GenoCode creatures read: the music values (how loud it is, its hits,
// its mood, its balance, its notes, where the song is going and its singing) and beat (docs/LANGUAGE.md section 16).

export { MusicAnalyser, HOP } from "./analyser.js";
export { BeatTracker } from "./beat.js";
export { BINS, SPECTRUM_BLOCK, spectrum } from "./fft.js";
export { Notes, noteAngle, type NoteInputs } from "./notes.js";
export { SongShape, type ShapeInputs } from "./shape.js";
export { BLOCK, OCTAVES, octaves, toInt16 } from "./octaves.js";
export { MusicPlayer, type MusicSource } from "./player.js";
export { SongWords, findWords, parseLrc, songFromFileName, type TimedLine } from "./words.js";
