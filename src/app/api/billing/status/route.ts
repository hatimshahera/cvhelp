import { NextResponse } from "next/server";
import { getBillingStatus } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to view billing status." }, { status: 401 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id }
  });

  return NextResponse.json({
    billing: getBillingStatus(subscription)
  });
}
