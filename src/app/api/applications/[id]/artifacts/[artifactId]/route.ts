import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

type RouteParams = {
  params: Promise<{ id: string; artifactId: string }>;
};

export async function GET(_request: Request, context: RouteParams) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to view this artifact." }, { status: 401 });
  }

  const { id, artifactId } = await context.params;
  const artifact = await prisma.applicationArtifact.findFirst({
    where: {
      id: artifactId,
      applicationId: id,
      userId: user.id
    }
  });

  if (!artifact) {
    return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }

  return NextResponse.json({ artifact });
}
