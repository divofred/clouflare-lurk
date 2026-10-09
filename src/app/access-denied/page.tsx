import { SignOutButton } from "@clerk/nextjs";
export default function AccessDeniedPage() {
  return <main className="mx-auto max-w-lg p-10"><h1>Internal agency workspace</h1>
    <p>Sign in with a verified account approved by your workspace administrator.</p>
    <SignOutButton redirectUrl="/sign-in"><button className="mt-4 underline">Sign out</button></SignOutButton>
  </main>;
}
