import { NextResponse } from "next/server";
import { renderArtifactToPdf } from "@/lib/pdf-render";
import { texFilename } from "@/lib/tex-export";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ id: string; artifactId: string }>;
};

export async function GET(_request: Request, context: RouteParams) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to preview this artifact." }, { status: 401 });
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

  try {
    const pdf = await renderArtifactToPdf({
      title: artifact.title,
      type: artifact.type,
      version: artifact.version,
      content: artifact.content
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${texFilename({
          type: artifact.type,
          version: artifact.version
        }).replace(/\.tex$/, ".pdf")}"`
      }
    });
  } catch (error) {
    return NextResponse.json({ error: "Could not render this PDF preview." }, { status: 500 });
  }
}
