import { NextResponse } from "next/server";
import { isStripeConfigured } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to open billing portal." }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe billing portal is not configured yet." },
      { status: 501 }
    );
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id }
  });

  if (!subscription?.providerCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer is connected to this account yet." },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { error: "Stripe billing portal is planned but not connected yet." },
    { status: 501 }
  );
}
