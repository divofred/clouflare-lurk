import { NewProjectForm } from "@/components/product/NewProjectForm";
import { requireLocalUser } from "@/lib/auth";

export default async function NewProjectPage() {
  await requireLocalUser();
  return (
    <div className="grid max-w-5xl items-start gap-x-12 gap-y-10 min-[900px]:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-h2" style={{ fontWeight: 500 }}>
            Add a client project
          </h1>
          <p className="text-body text-fg-muted">
            Describe this client so we can find relevant Reddit conversations. A website is optional.
          </p>
        </div>
        <NewProjectForm />
      </div>
      <aside className="text-small text-fg-muted">
        <p>Keep each client in a separate project. We use these details to judge whether a Reddit conversation is relevant.</p>
        <p className="mt-3">Start with one client, review the leads, then refine the profile and search terms.</p>
      </aside>
    </div>
  );
}
