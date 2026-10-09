"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createProjectAndProfileAction,
  type NewProjectState,
} from "@/app/app/projects/new/actions";

const INITIAL: NewProjectState = { error: null };

/** The scheme is drawn in front of the field, so one that is typed or pasted is dropped. */
function bareAddress(value: string): string {
  return value.trim().replace(/^(?:https?:)?\/\//i, "");
}

/**
 * The product URL and one submit. The site names the project, so nothing else
 * is asked, and the submit only creates it: reading the site and everything
 * after happens in a job the leads page draws.
 */
export function NewProjectForm() {
  const [state, formAction, pending] = useActionState(
    createProjectAndProfileAction,
    INITIAL,
  );
  const [address, setAddress] = useState("");

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-card border bg-surface p-6"
    >
      {[
        ["name", "Client or business name", "Example: Acme Web Studio"],
        ["solution", "What does this client sell?", "Services or products and what makes them useful"],
        ["pain", "What problem do they solve?", "Describe the problem customers need help with"],
        ["targetUsers", "Who are their customers?", "Example: small business owners who need a website"],
        ["geography", "Locations and languages", "Example: Nigeria, English; or worldwide"],
      ].map(([name, label, placeholder]) => (
        <label key={name} className="flex flex-col gap-1 text-small text-fg-muted">
          {label}
          <textarea name={name} required={name !== "geography"} disabled={pending}
            maxLength={name === "name" ? 120 : name === "geography" ? 300 : 2000}
            rows={name === "name" || name === "geography" ? 1 : 3}
            placeholder={placeholder}
            className="rounded-control border bg-surface p-3 text-body text-fg" />
        </label>
      ))}
      <label className="flex flex-col gap-1 text-small text-fg-muted">
        Website (optional)
        <span className="flex h-10 items-stretch overflow-hidden rounded-control border bg-surface text-body focus-within:ring-2 focus-within:ring-fg-muted/40">
          <span aria-hidden="true" className="flex select-none items-center border-r bg-surface-2 px-3 text-fg-muted">
            https://
          </span>
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            disabled={pending}
            value={address}
            onChange={(event) => setAddress(bareAddress(event.target.value))}
            placeholder="yourproduct.com"
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-fg outline-none placeholder:text-fg-muted placeholder:opacity-60"
          />
        </span>
        <input type="hidden" name="url" value={address ? `https://${address}` : ""} />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating" : "Create project"}
        </Button>
      </div>
      {state.error ? (
        <p aria-live="polite" className="text-body text-fg-muted">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
