import { NextResponse } from "next/server";
import { checkFeatureLimit, getBillingStatus } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  createApplicationFromJobSource,
  createApplicationInputSchema
} from "@/lib/tools/application-actions";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to view applications." }, { status: 401 });
  }

  const applications = await prisma.application.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      company: true,
      role: true,
      slug: true,
      status: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ applications });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to add applications." }, { status: 401 });
  }

  const [subscription, applicationCount] = await Promise.all([
    prisma.subscription.findUnique({
      where: { userId: user.id }
    }),
    prisma.application.count({
      where: { userId: user.id, archivedAt: null }
    })
  ]);
  const billing = getBillingStatus(subscription);
  const applicationLimit = checkFeatureLimit({
    plan: billing.plan,
    feature: "applications",
    used: applicationCount
  });

  if (!applicationLimit.allowed) {
    return NextResponse.json(
      {
        error: `You have reached the ${applicationLimit.limit} application limit for the ${billing.plan} plan.`,
        billing
      },
      { status: 402 }
    );
  }

  const parsed = createApplicationInputSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the job description." },
      { status: 400 }
    );
  }

  try {
    const application = await createApplicationFromJobSource({
      userId: user.id,
      input: parsed.data
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read the job source." },
      { status: 400 }
    );
  }
}
