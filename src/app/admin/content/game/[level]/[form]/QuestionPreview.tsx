"use client";

import { useState, type CSSProperties } from "react";
import { MicIcon, SpeakerIcon } from "@/components/icons";
import type { AssessmentItem } from "@/lib/database.types";
import type { Part } from "@/lib/gameParts";
import { isWordCard, showAsTiles } from "@/lib/gameLayout";
import { itemGivesFeedback } from "@/lib/gameItems";
import { optionPicture, type OptionPicture } from "@/lib/optionPicture";
import { itemSpokenText } from "@/lib/spoken";
import { canSpeak, sayAloud } from "@/lib/voice";
import { recordedClip } from "@/lib/voiceClips";

/**
 * A question as the child will see it, drawn with the game's own styles
 * (globals.css .rw-*) and layout rules (gameLayout.ts), with the right
 * answers marked, plus what Sunny will say and a button to hear it.
 */
export function QuestionPreview({
  item,
  part,
  showFeedback,
}: {
  item: AssessmentItem;
  part: Part | null;
  showFeedback: boolean;
}) {
  const pictures = (item.options ?? []).map((o) => optionPicture(o.text));
  const tiles = showAsTiles(pictures);
  const spoken = itemSpokenText(item);
  const recorded = spoken ? recordedClip(spoken) !== null : false;
  const marks = showFeedback && itemGivesFeedback(item);

  return (
    <div className="flex flex-col gap-3">
      <div className="rw-preview rounded-[22px] bg-[var(--color-neutral)] p-3" inert>
        <div className="rw-mission-card" style={{ marginTop: 0 }}>
          <div className="rw-mission-top">
            <div className="rw-part-badge" style={{ background: part?.color ?? "#0f766e" }}>
              {part ? `PART ${part.number} · ${part.code}` : "MISSION"}
            </div>
            <span className="rw-listen">
              <SpeakerIcon size={17} color="currentColor" /> Listen
            </span>
          </div>
          {item.passage &&
            (isWordCard(item) ? (
              <div className="rw-word-card">{item.passage}</div>
            ) : (
              <div className={`rw-passage ${item.type === "mic" ? "rw-passage-read" : ""}`}>{item.passage}</div>
            ))}
          <div className="rw-prompt">{item.prompt || <span className="text-[var(--color-muted)]">Your question…</span>}</div>
          {item.type === "choice" && (
            <div
              className={`rw-options ${tiles ? `rw-tiles${pictures.length === 4 ? " four" : ""}` : ""}`}
              style={tiles ? ({ "--cols": Math.min(pictures.length, 4) } as CSSProperties) : undefined}
            >
              {(item.options ?? []).map((option, i) => {
                const picture = pictures[i];
                return (
                  <div key={i} className={`rw-option ${tiles ? "rw-tile" : ""} ${option.isCorrect ? "correct" : ""}`}>
                    {!tiles && <span className="rw-option-letter">{String.fromCharCode(65 + i)}</span>}
                    <PreviewImage picture={picture} tile={tiles} />
                    {tiles ? !picture.src && <span className="rw-tile-glyph">{picture.label}</span> : <span>{picture.label || "…"}</span>}
                    {option.isCorrect && <span className="rw-check">✓</span>}
                  </div>
                );
              })}
            </div>
          )}
          {item.type === "text" && <div className="rw-writing-input text-[var(--color-muted)]">Write your answer here…</div>}
          {item.type === "mic" && (
            <div className="rw-mic-wrap">
              <span className="rw-mic">
                <MicIcon />
              </span>
              <strong>Tap to read aloud</strong>
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-[var(--color-muted)] m-0">
        {item.type === "choice"
          ? marks
            ? "Right answers are green here. Children find out when they answer."
            : "Right answers are green here. Children are never told if they were right on this question."
          : item.type === "mic"
            ? "The child taps the mic and reads. The app listens and checks the words."
            : "The child types their answer, which is checked for spelling."}
      </p>

      <div className="rounded-2xl border-2 border-[var(--color-neutral-divider)] px-4 py-3">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Sunny says</span>
          <HearButton text={spoken} />
        </div>
        <p className="text-sm text-[var(--color-ink)] m-0 mb-1.5 italic">{spoken ? `“${spoken}”` : "Nothing yet."}</p>
        {spoken && (
          <p className="text-xs text-[var(--color-muted)] m-0">
            {recorded
              ? "Sunny's recorded voice says this line."
              : "No recording of this exact line, so the tablet's own voice says it."}
          </p>
        )}
      </div>
    </div>
  );
}

function PreviewImage({ picture, tile }: { picture: OptionPicture; tile: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!picture.src || failed === picture.src) {
    return picture.emoji ? <span className={tile ? "rw-tile-emoji" : "rw-option-emoji"}>{picture.emoji}</span> : null;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={picture.src} alt="" className={tile ? "rw-tile-img" : "rw-option-img"} onError={() => setFailed(picture.src)} />
  );
}

function HearButton({ text }: { text: string }) {
  if (!text) return null;
  return (
    <button
      type="button"
      onClick={() => canSpeak() && sayAloud(text)}
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--color-neutral-border)] bg-transparent px-3 py-1 text-xs font-bold text-[var(--color-orange-dark)] cursor-pointer hover:border-[var(--color-orange)]"
    >
      <SpeakerIcon size={14} color="currentColor" /> Hear it
    </button>
  );
}
