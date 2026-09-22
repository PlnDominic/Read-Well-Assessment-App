"use client";

import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { addSkillArea, deleteSkillArea, renameSkillArea } from "./actions";

interface SkillArea {
  id: string;
  key: string;
  name: string;
  inUse: boolean;
}

export function SkillAreasEditor({ skillAreas }: { skillAreas: SkillArea[] }) {
  return (
    <div>
      <div className="flex flex-col gap-2.5 mb-5">
        {skillAreas.map((sa) => (
          <form key={sa.id} action={renameSkillArea} className="flex items-center gap-2.5">
            <input type="hidden" name="id" value={sa.id} />
            <input type="hidden" name="key" value={sa.key} />
            <code className="text-xs text-[var(--color-muted-light)] bg-[var(--color-cream)] px-2 py-1 rounded w-28 truncate">
              {sa.key}
            </code>
            <input
              name="name"
              defaultValue={sa.name}
              required
              className="flex-1 border-2 border-[var(--color-cream-border)] rounded-lg px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="bg-white border-[1.5px] border-[var(--color-cream-border-strong)] text-[var(--color-sage-dark)] font-bold text-xs px-3 py-1.5 rounded-full cursor-pointer whitespace-nowrap"
            >
              Save
            </button>
            {sa.inUse ? (
              <span className="text-[var(--color-muted-light)] text-xs whitespace-nowrap">In use</span>
            ) : (
              <ConfirmSubmitButton
                formAction={deleteSkillArea}
                confirmMessage={`Delete the "${sa.name}" skill area?`}
                className="text-[var(--color-terracotta-dark)] text-xs font-bold bg-none border-none cursor-pointer whitespace-nowrap"
              >
                Delete
              </ConfirmSubmitButton>
            )}
          </form>
        ))}
      </div>

      <form action={addSkillArea} className="flex flex-wrap items-end gap-2.5 border-t border-[var(--color-cream-divider)] pt-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Key</span>
          <input
            name="key"
            placeholder="e.g. grammar"
            required
            className="border-2 border-[var(--color-cream-border)] rounded-lg px-3 py-1.5 text-sm w-32"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm flex-1 min-w-[160px]">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Name</span>
          <input
            name="name"
            placeholder="e.g. Grammar"
            required
            className="border-2 border-[var(--color-cream-border)] rounded-lg px-3 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="bg-[var(--color-sage)] text-white border-none rounded-full font-bold text-sm px-4.5 py-2 cursor-pointer"
        >
          Add skill area
        </button>
      </form>
    </div>
  );
}
