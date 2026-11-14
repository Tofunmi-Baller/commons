"use client";

import { useActionState, useState } from "react";
import { signInAction, signUpAction } from "@/app/actions";
import { Button, Field, inputClass } from "@/components/ui";

export function AccountForms() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState(signInAction, null);
  const [upState, upAction, upPending] = useActionState(signUpAction, null);
  const state = mode === "in" ? inState : upState;
  return (
    <div>
      <div className="mb-6 flex gap-1 rounded-full bg-white/[0.05] p-1 text-sm">
        {(["in", "up"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-full py-2 transition ${mode === m ? "bg-lime font-medium text-ink" : "text-muted hover:text-paper"}`}>
            {m === "in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <form action={mode === "in" ? inAction : upAction} className="space-y-4">
        {mode === "up" && (
          <>
            <Field label="Full name"><input name="fullName" required className={inputClass} autoComplete="name" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Business"><input name="businessName" className={inputClass} /></Field>
              <Field label="Location"><input name="location" placeholder="Brooklyn, New York" className={inputClass} /></Field>
            </div>
          </>
        )}
        <Field label="Email"><input name="email" type="email" required className={inputClass} autoComplete="email" /></Field>
        <Field label="Password" hint={mode === "up" ? "At least 8 characters" : undefined}>
          <input name="password" type="password" required minLength={8} className={inputClass} autoComplete={mode === "in" ? "current-password" : "new-password"} />
        </Field>
        {state && !state.ok && <p className="text-sm text-danger" role="alert">{state.error}</p>}
        <Button size="lg" className="w-full" disabled={inPending || upPending}>{mode === "in" ? "Sign in" : "Create account"}</Button>
      </form>
    </div>
  );
}
