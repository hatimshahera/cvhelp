import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";

export default async function AppPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  if (!user) redirect("/sign-in");

  return (
    <AppShell
      userName={user.firstName || user.username || "there"}
      userEmail={user.primaryEmailAddress?.emailAddress || ""}
    />
  );
}
