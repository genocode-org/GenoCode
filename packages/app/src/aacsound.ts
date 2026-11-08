// Some browsers (Brave and Chrome on Linux, for one) can't record AAC sound, so their MP4 videos
// carry Opus sound instead, which many phones' video players refuse ("audio codec not
// supported"). `aacSound` writes the video again with its sound as AAC: the picture is copied as it
// is, only the sound is encoded again. It loads its encoder only when it's needed.

/** Whether an MP4 recording in this format already has AAC sound, or no sound. */
export function soundIsAac(type: string): boolean {
  return /mp4a/.test(type);
}

/** The video with AAC sound, or undefined when it can't be made (the caller keeps the original). */
export async function aacSound(video: Blob): Promise<Blob | undefined> {
  const mb = await import("mediabunny");
  if (!(await mb.canEncodeAudio("aac"))) {
    const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
    registerAacEncoder();
  }
  const input = new mb.Input({ source: new mb.BlobSource(video), formats: mb.ALL_FORMATS });
  const target = new mb.BufferTarget();
  const output = new mb.Output({
    // Not fragmented, with the index at the front: what phones and sharing apps expect.
    format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const conversion = await mb.Conversion.init({
    input,
    output,
    video: { forceTranscode: false },
    audio: { codec: "aac", bitrate: 192_000 },
  });
  if (!conversion.isValid) return undefined;
  await conversion.execute();
  return target.buffer ? new Blob([target.buffer], { type: "video/mp4" }) : undefined;
}
