import { NextResponse } from "next/server";
import { PdfRenderUnavailableError, renderTexToPdf } from "@/lib/pdf-render";
import { artifactToTex, texFilename } from "@/lib/tex-export";
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
    const tex = artifactToTex({
      title: artifact.title,
      type: artifact.type,
      version: artifact.version,
      content: artifact.content
    });
    const pdf = await renderTexToPdf(tex);

    return new NextResponse(pdf, {
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
    if (error instanceof PdfRenderUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 501 });
    }

    return NextResponse.json({ error: "Could not render this PDF preview." }, { status: 500 });
  }
}
