"use client";

import type { AssessmentItem } from "@/lib/database.types";
import { shortCode, type FormDef, type PartDef } from "@/lib/readwell/form";
import { scoreOf, type Answers, type PartFlow } from "@/lib/readwell/flow";
import { Card, RightWrong } from "./ui";
import { StoryPart } from "./StoryPart";

export interface PartViewProps {
  form: FormDef;
  part: PartDef;
  flow: PartFlow;
  flows: PartFlow[];
  answers: Answers;
  setMarks: (marks: Answers) => void;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}

export function PartView({ form, part, flow, flows, answers, setMarks, onBack, onNext, nextLabel }: PartViewProps) {
  const items = form.items.filter((i) => i.part === part.number);
  const active = new Set(flow.activeItemIds);
  const done = flow.status === "complete";
  const rule = flow.stopped ?? flow.limited;
  const gate = done ? gateNotice(flows, part.number) : null;

  return (
    <>
      <Card>
        <div className="flex justify-between items-baseline flex-wrap gap-2 mb-3">
          <h2 className="font-heading font-bold text-xl text-[var(--color-ink)] m-0">
            Part {part.number}: {part.title} ({part.code})
          </h2>
          <span className="text-xs font-bold text-[var(--color-muted)]">Stimulus book: {part.stimulus}</span>
        </div>

        <Script part={part} />

        {part.practice && (
          <p className="text-sm text-[var(--color-body)] m-0 mt-3">
            <strong>Practice:</strong> {part.practice}. Teach on the practice item only; it isn&apos;t scored.
          </p>
        )}

        {part.notes.length > 0 && (
          <ul className="text-sm text-[var(--color-body)] m-0 mt-3 pl-5 flex flex-col gap-1 list-disc">
            {part.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        {part.acceptTable && (
          <table className="text-sm border-collapse mt-3">
            <thead>
              <tr className="text-left text-[var(--color-muted)]">
                <th className="py-1 pr-4">Letter</th>
                <th className="py-1">Accept</th>
              </tr>
            </thead>
            <tbody>
              {part.acceptTable.map((row) => (
                <tr key={row.letter} className="border-t border-[var(--color-neutral-divider)] align-top">
                  <td className="py-1 pr-4 font-bold whitespace-nowrap">{row.letter}</td>
                  <td className="py-1">{row.accept}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        {part.kind === "story" ? (
          <StoryPart form={form} items={items} flow={flow} answers={answers} setMarks={setMarks} />
        ) : part.kind === "grid" || part.kind === "ladder" ? (
          <Grid part={part} items={items} active={active} answers={answers} setMarks={setMarks} />
        ) : part.kind === "attitude" ? (
          <Attitude items={items} answers={answers} setMarks={setMarks} />
        ) : (
          <Questions part={part} items={items} answers={answers} setMarks={setMarks} />
        )}

        {rule && (
          <p role="status" className="bg-[var(--color-orange-tint)] border border-[var(--color-orange-tint-border)] text-[var(--color-ink-soft)] text-sm rounded-xl px-4 py-3 m-0 mt-4">
            <strong>{rule.by}:</strong> {rule.reason} {flow.stopped ? "Stop this part." : ""}
          </p>
        )}
        {gate && (
          <p role="status" className="bg-[var(--color-orange-tint)] border border-[var(--color-orange-tint-border)] text-[var(--color-ink-soft)] text-sm rounded-xl px-4 py-3 m-0 mt-4">
            {gate}
          </p>
        )}
        {done && part.after && !gate && <p className="text-sm text-[var(--color-muted)] m-0 mt-4">{part.after} The app checks it for you.</p>}
        {done && part.number === 6 && (
          <p className="text-sm text-[var(--color-muted)] m-0 mt-2">If the child is tired, you can pause here and finish in a second sitting on the same day or the next.</p>
        )}
      </Card>

      <div className="flex justify-between gap-3 flex-wrap mb-8">
        <button
          type="button"
          onClick={onBack}
          className="font-bold text-sm px-4.5 py-2.5 rounded-full cursor-pointer bg-[var(--color-neutral)] border-none text-[var(--color-ink)]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!done}
          title={done ? undefined : "Mark every item in this part first"}
          className="bg-[var(--color-orange)] text-white border-none rounded-full font-bold text-sm px-5 py-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          {nextLabel}
        </button>
      </div>
    </>
  );
}

/**
 * When finishing this part makes a gate skip what would come next, say so
 * in the guide's terms: which gate, why, what's skipped, where to go.
 */
function gateNotice(flows: PartFlow[], partNumber: number): string | null {
  const skipped = flows.filter((f) => f.number > partNumber && f.number <= 12 && f.status === "skipped");
  const decidedHere = skipped.filter((f) => {
    const by = f.skipped!.by;
    return (by === "Gate A" && partNumber === 6) || (by === "Gate B" && partNumber === 7) || (by === "Gate C" && partNumber === 8);
  });
  if (decidedHere.length === 0) return null;
  const { by, reason } = decidedHere[0].skipped!;
  const parts = decidedHere.map((f) => f.number);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : String(parts[0]);
  const limited = flows.find((f) => f.limited?.by === by);
  return `${by} applies: ${reason} Skip Part${parts.length > 1 ? "s" : ""} ${list}.${limited ? ` Give only the first row of Part ${limited.number}.` : ""}`;
}

function Script({ part }: { part: PartDef }) {
  return (
    <div className="bg-[var(--color-neutral)] rounded-xl px-4 py-3 text-[15px] leading-relaxed flex flex-col gap-2">
      {part.script.map((line, i) =>
        line.say ? (
          <p key={i} className="m-0 font-bold text-[var(--color-ink)]">
            &ldquo;{line.say}&rdquo;
          </p>
        ) : (
          <p key={i} className="m-0 text-[var(--color-body)]">
            {line.do}
          </p>
        )
      )}
    </div>
  );
}

function Questions({ part, items, answers, setMarks }: { part: PartDef; items: AssessmentItem[]; answers: Answers; setMarks: (m: Answers) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.id}>
          {item.instruction && <p className="text-sm text-[var(--color-body)] m-0 mb-2 italic">{item.instruction}</p>}
          <div className="flex justify-between items-center gap-3 flex-wrap border-b border-[var(--color-neutral-divider)] pb-3">
            <div className="min-w-[220px] flex-1">
              <div className="text-[11px] font-extrabold text-[var(--color-muted)] mb-0.5">{shortCode(item.id)}</div>
              <div className="font-bold text-[var(--color-ink)]">
                {part.kind === "vocabulary" ? <>&ldquo;Point to the {item.prompt}.&rdquo;</> : <>&ldquo;{item.prompt}&rdquo;</>}
              </div>
              {item.detail && <div className="text-xs text-[var(--color-muted)] mt-0.5">Pictures: {item.detail}</div>}
              {item.accept && (
                <div className="text-xs text-[var(--color-body)] mt-0.5">
                  {part.number === 3 ? "Correct if the child: " : "Accept: "}
                  {item.accept}
                </div>
              )}
            </div>
            <RightWrong itemId={item.id} answers={answers} setMarks={setMarks} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Letter and word grids, and the sound ladder. Tap a cell once for right,
 * again for wrong (a slash, as on paper), a third time to clear. "Rest of
 * row right" fills the unmarked cells in a row, the quick path when a
 * child reads a row cleanly.
 */
function Grid({
  part,
  items,
  active,
  answers,
  setMarks,
}: {
  part: PartDef;
  items: AssessmentItem[];
  active: Set<string>;
  answers: Answers;
  setMarks: (m: Answers) => void;
}) {
  const rows = [...new Set(items.map((i) => i.row ?? 1))];
  const ladder = part.kind === "ladder";
  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => {
        const rowItems = items.filter((i) => (i.row ?? 1) === row);
        const rowActive = rowItems.some((i) => active.has(i.id));
        const unmarked = rowItems.filter((i) => active.has(i.id) && scoreOf(answers, i.id) === undefined);
        return (
          <div key={row} style={{ opacity: rowActive ? 1 : 0.4 }}>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-extrabold text-[var(--color-muted)] uppercase">
                {ladder ? `Rung ${row}` : `Row ${row}`}
                {!rowActive && " · not given"}
              </span>
              {rowActive && unmarked.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMarks(Object.fromEntries(unmarked.map((i) => [i.id, 1])))}
                  className="text-xs font-bold text-[var(--color-orange-dark)] bg-transparent border-none cursor-pointer"
                >
                  Rest of {ladder ? "rung" : "row"} right
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {rowItems.map((item) => {
                const score = scoreOf(answers, item.id);
                const enabled = active.has(item.id);
                const next = score === undefined ? 1 : score === 1 ? 0 : null;
                const label = ladder ? shortCode(item.id).replace(/^SA/, "") : item.prompt;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!enabled}
                    onClick={() => setMarks({ [item.id]: next })}
                    aria-label={`${shortCode(item.id)} ${item.prompt}: ${score === 1 ? "right" : score === 0 ? "wrong" : "not marked"}`}
                    className="relative rounded-xl cursor-pointer disabled:cursor-default flex flex-col items-center justify-center"
                    style={{
                      minWidth: ladder ? 64 : 72,
                      minHeight: 64,
                      padding: "6px 10px",
                      border: `2px solid ${score === 1 ? "var(--color-ink)" : score === 0 ? "var(--color-orange)" : "var(--color-neutral-border)"}`,
                      background: score === 1 ? "var(--color-ink)" : score === 0 ? "var(--color-orange-tint)" : "var(--color-surface)",
                      color: score === 1 ? "var(--color-surface)" : "var(--color-ink)",
                    }}
                  >
                    <span
                      className="font-heading font-bold"
                      style={{
                        fontSize: ladder ? 16 : item.prompt.length <= 2 ? 28 : 22,
                        textDecorationLine: score === 0 ? "line-through" : "none",
                        textDecorationColor: "var(--color-orange-dark)",
                        textDecorationThickness: 3,
                      }}
                    >
                      {label}
                    </span>
                    {item.detail && <span className="text-[10px] opacity-75">{item.detail}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Attitude({ items, answers, setMarks }: { items: AssessmentItem[]; answers: Answers; setMarks: (m: Answers) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.id} className="flex justify-between items-center gap-3 flex-wrap border-b border-[var(--color-neutral-divider)] pb-3">
          <div className="min-w-[220px] flex-1">
            <div className="text-[11px] font-extrabold text-[var(--color-muted)] mb-0.5">{shortCode(item.id)}</div>
            <div className="font-bold text-[var(--color-ink)]">&ldquo;{item.prompt}&rdquo;</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {item.responseChoices!.map((c) => {
              const selected = answers[item.id] === c.value;
              return (
                <button
                  key={String(c.value)}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setMarks({ [item.id]: selected ? null : c.value })}
                  className="font-bold text-sm px-3.5 py-2.5 rounded-xl cursor-pointer"
                  style={{
                    border: `2px solid ${selected ? "var(--color-ink)" : "var(--color-neutral-border)"}`,
                    background: selected ? "var(--color-ink)" : "var(--color-surface)",
                    color: selected ? "var(--color-surface)" : "var(--color-ink)",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
