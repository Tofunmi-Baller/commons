"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";
import { signInDemoAction } from "@/app/actions";

export function PersonaSwitcher({ current, personas }: { current: string; personas: { id: string; label: string }[] }) {
  const path = usePathname();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={signInDemoAction} className="flex items-center gap-2">
      <input type="hidden" name="next" value={path} />
      <label htmlFor="persona" className="hidden text-[12px] text-muted sm:block">Demo as</label>
      <select
        id="persona"
        name="persona"
        defaultValue={current}
        onChange={() => form.current?.requestSubmit()}
        className="h-8 max-w-[52vw] truncate rounded-lg border sm:max-w-none border-warn/40 bg-warn/10 px-2 text-[13px] text-warn outline-none"
      >
        {personas.map((p) => (
          <option key={p.id} value={p.id} className="bg-ink text-paper">{p.label}</option>
        ))}
      </select>
    </form>
  );
}
