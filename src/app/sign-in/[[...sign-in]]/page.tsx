import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="clerk-screen">
      <SignIn />
    </main>
  );
}
