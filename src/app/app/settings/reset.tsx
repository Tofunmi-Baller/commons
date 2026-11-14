"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { resetDemoAction } from "@/app/actions";
import { Button } from "@/components/ui";

export function ResetDemo() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-2">
      {confirm ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="dark" disabled={pending} onClick={() => start(async () => { const r = await resetDemoAction(); setMsg(r.ok ? "Demo reset. A fresh demo pool is ready." : r.error); setConfirm(false); router.refresh(); })}>
            <RotateCcw className="size-4" /> Yes, reset demo data
          </Button>
          <Button variant="ghost" className="text-ink/70 hover:bg-ink/10 hover:text-ink" onClick={() => setConfirm(false)}>Cancel</Button>
        </div>
      ) : (
        <Button variant="dark" onClick={() => setConfirm(true)}><RotateCcw className="size-4" /> Reset demo</Button>
      )}
      {msg && <p className="text-[13px] text-ink font-medium">{msg}</p>}
    </div>
  );
}
