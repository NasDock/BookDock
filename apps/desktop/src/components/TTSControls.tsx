/**
 * TTSControls — minimal "read aloud this chunk" panel.
 *
 * Without a paragraph context (e.g. the floating panel on a book
 * page), this falls back to treating the text as a single-paragraph
 * play. The real per-paragraph experience is in Reader-TTS.
 */
import { Paragraph, TTSVoice } from "@bookdock/api-client";
import { TTSManager, TTSState } from "@bookdock/tts";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

interface Props {
  text?: string;
  bookId?: string;
  onClose?: () => void;
}

export const TTSControls: React.FC<Props> = ({
  text,
  bookId,
  onClose: _onClose,
}) => {
  const manager = useMemo(() => new TTSManager(), []);
  const [state, setState] = useState<TTSState>("idle");
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [voice, setVoice] = useState<string>("");
  const [rate, setRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);

  useEffect(() => {
    manager.initialize("edge").then(() => {
      const vs = manager.getAvailableVoices();
      setVoices(vs);
      if (vs[0]) setVoice(vs[0].id);
    });
    return () => manager.stop();
  }, [manager]);

  const handlePlay = async () => {
    if (!text) return;
    manager.setConfig({
      provider: "edge",
      voiceId: voice,
      rate,
      volume,
      bookId,
    });
    const para: Paragraph = {
      id: "tts-1",
      index: 0,
      text,
      charStart: 0,
      charEnd: text.length,
    };
    if (state === "paused") manager.resume();
    else
      await manager.play([para], 0, {
        onStart: () => setState("playing"),
        onPause: () => setState("paused"),
        onResume: () => setState("playing"),
        onEnd: () => setState("idle"),
        onError: () => setState("error"),
      });
  };

  const displayLang = (v: TTSVoice) => v.language || v.lang || "";

  return (
    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow flex items-center gap-2">
      <Volume2 className="w-4 h-4" />
      <select
        value={voice}
        onChange={(e) => setVoice(e.target.value)}
        className="text-sm border rounded px-1 py-0.5 dark:bg-gray-700 dark:text-white"
      >
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} ({displayLang(v)})
          </option>
        ))}
      </select>
      <input
        type="range"
        min={0.5}
        max={2}
        step={0.1}
        value={rate}
        onChange={(e) => {
          const r = parseFloat(e.target.value);
          setRate(r);
          manager.setPlaybackRate(r);
        }}
        className="w-16"
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          setVolume(v);
          manager.setVolume(v);
        }}
        className="w-16"
      />
      <button
        onClick={state === "playing" ? () => manager.pause() : handlePlay}
        className="p-1.5 rounded bg-blue-500 text-white"
      >
        {state === "playing" ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
      </button>
      <button
        onClick={() => {
          manager.stop();
          setState("idle");
        }}
        className="p-1.5 rounded bg-gray-200 dark:bg-gray-700"
      >
        <Square className="w-4 h-4" />
      </button>
    </div>
  );
};

export default TTSControls;
