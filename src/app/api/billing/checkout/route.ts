import { NextResponse } from "next/server";
import { isStripeConfigured } from "@/lib/billing";
import { getCurrentUser } from "@/lib/session";

export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to start checkout." }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe checkout is not configured yet." },
      { status: 501 }
    );
  }

  return NextResponse.json(
    { error: "Stripe checkout is planned but not connected yet." },
    { status: 501 }
  );
}
