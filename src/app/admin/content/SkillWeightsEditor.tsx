"use client";

import { updateSkillWeight } from "./actions";

interface SkillAreaWeight {
  id: string;
  name: string;
  weight: number;
  flaggedThreshold: number | null;
}

export function SkillWeightsEditor({ skillAreas }: { skillAreas: SkillAreaWeight[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {skillAreas.map((sa) => (
        <form key={sa.id} action={updateSkillWeight} className="flex flex-wrap items-end gap-2.5">
          <input type="hidden" name="skillAreaId" value={sa.id} />
          <span className="flex-1 min-w-[140px] font-bold text-[var(--color-ink)] text-sm">{sa.name}</span>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Weight</span>
            <input
              name="weight"
              type="number"
              min="0.1"
              step="0.1"
              defaultValue={sa.weight}
              className="border-2 border-[var(--color-neutral-border)] rounded-lg px-3 py-1.5 text-sm w-20"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Flag below %</span>
            <input
              name="flaggedThreshold"
              type="number"
              min="0"
              max="100"
              placeholder="Default"
              defaultValue={sa.flaggedThreshold ?? ""}
              className="border-2 border-[var(--color-neutral-border)] rounded-lg px-3 py-1.5 text-sm w-24"
            />
          </label>
          <button
            type="submit"
            className="bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] transition-colors hover:bg-[var(--color-neutral-divider)] font-bold text-xs px-3 py-1.5 rounded-full cursor-pointer"
          >
            Save
          </button>
        </form>
      ))}
    </div>
  );
}
