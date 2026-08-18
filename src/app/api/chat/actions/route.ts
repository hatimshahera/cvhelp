import { NextResponse } from "next/server";
import {
  PlatformActionError,
  executePlatformAction,
  platformActionInputSchema
} from "@/lib/chat/platform-actions";
import { getCurrentUser } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to run chat actions." }, { status: 401 });
  }

  const parsed = platformActionInputSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the action payload." },
      { status: 400 }
    );
  }

  try {
    const result = await executePlatformAction({
      userId: user.id,
      input: parsed.data
    });

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof PlatformActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "The chat action failed." }, { status: 500 });
  }
}
