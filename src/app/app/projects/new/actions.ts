"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enqueueJob } from "@/jobs/enqueue";
import { kickScheduler } from "@/jobs/scheduler";
import { errorMessage, failure } from "@/lib/actionResult";
import { requireLocalUser } from "@/lib/auth";
import { z } from "zod";
import { createProject } from "@/lib/projects";

export type NewProjectState = { error: string | null };

const FALLBACK = "Something went wrong.";

/**
 * The name the project carries until the page read names it: the host, less
 * its "www.", so a broken read still leaves a project the switcher can show.
 */
function nameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Creates the project and hands everything else to a job, then opens the leads
 * page, where the work is drawn as it happens. Nothing is read inside the
 * request: the page read alone held the form for 28 seconds, and the profile it
 * produced is not what a person who just pasted a URL came to look at.
 */
export async function createProjectAndProfileAction(
  _previous: NewProjectState,
  formData: FormData,
): Promise<NewProjectState> {
  const user = await requireLocalUser();
  const url = String(formData.get("url") ?? "").trim();
  const manual = String(formData.get("name") ?? "").trim();
  const fields = z.object({
    name: z.string().trim().min(1).max(120),
    solution: z.string().trim().min(10).max(4000),
    pain: z.string().trim().min(5).max(2000),
    targetUsers: z.string().trim().min(3).max(2000),
    geography: z.string().trim().max(300),
  }).safeParse(Object.fromEntries(["name", "solution", "pain", "targetUsers", "geography"].map(
    (key) => [key, String(formData.get(key) ?? "")],
  )));
  if (manual && !fields.success) {
    return { error: "Enter the client name, services, customer problem, and target customers." };
  }
  if (!manual && !url) {
    return { error: "Describe your client or enter a product website." };
  }
  if (url && (!URL.canParse(url) || !["https:", "http:"].includes(new URL(url).protocol) || !new URL(url).hostname.includes("."))) {
    return { error: "Enter a valid http or https website address, or leave it blank." };
  }
  const name = manual || nameFromUrl(url);

  let projectId: string;
  try {
    const project = await createProject(user.id, name, url || null, manual && fields.success ? {
      pain: fields.data.pain, solution: fields.data.solution, targetUsers: fields.data.targetUsers,
      geography: fields.data.geography, problemPhrasings: [fields.data.pain],
    } : {});
    if (!project) {
      return { error: "The project could not be created." };
    }
    projectId = project.id;

  } catch (error) {
    return failure(error, FALLBACK);
  }

  try {
    await enqueueJob("discovery_initial", projectId);
    kickScheduler();
  } catch (error) {
    return { error: `${name} was created but its setup could not be queued: ${errorMessage(error, FALLBACK)}` };
  }

  revalidatePath("/app", "layout");
  redirect(`/app/leads?project=${projectId}`);
}
