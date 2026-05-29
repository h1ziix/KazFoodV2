import { redirect } from "next/navigation";

/**
 * Root route now forwards to the attestations list.
 *
 * Before the persistence rework this page hosted the single-document
 * editor (all state in `useState`, lost on navigation).  That editor
 * has moved to `/attestations/[id]` and is now scoped to a saved
 * project; the bare URL just funnels the user into their project list.
 */
export default function RootPage() {
  redirect("/attestations");
}
