import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canonicalProfileSections,
  createDefaultProfileBankData,
  parseCanonicalProfile,
  summarizeProfileBank,
  updateCanonicalProfileSection
} from "@/lib/memory";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const updateProfileSectionSchema = z.object({
  section: z.enum(canonicalProfileSections),
  value: z.unknown()
});

async function getOrCreateProfileBank(userId: string) {
  const defaults = createDefaultProfileBankData();

  return prisma.profileBank.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      masterProfile: defaults.masterProfile as Prisma.InputJsonValue,
      rawSources: defaults.rawSources as Prisma.InputJsonValue,
      checklist: defaults.checklist as Prisma.InputJsonValue
    }
  });
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to view your profile." }, { status: 401 });
  }

  const profileBank = await getOrCreateProfileBank(user.id);
  const profile = parseCanonicalProfile(profileBank.masterProfile);

  return NextResponse.json({
    profile,
    profileBank: summarizeProfileBank(profileBank)
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to update your profile." }, { status: 401 });
  }

  const parsed = updateProfileSectionSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the profile section update." },
      { status: 400 }
    );
  }

  const profileBank = await getOrCreateProfileBank(user.id);
  let nextProfile;

  try {
    nextProfile = updateCanonicalProfileSection(
      profileBank.masterProfile,
      parsed.data.section,
      parsed.data.value
    );
  } catch {
    return NextResponse.json(
      { error: `The ${parsed.data.section} section does not match the expected profile shape.` },
      { status: 400 }
    );
  }

  const updatedProfileBank = await prisma.profileBank.update({
    where: { userId: user.id },
    data: {
      masterProfile: nextProfile as Prisma.InputJsonValue
    }
  });

  return NextResponse.json({
    profile: nextProfile,
    profileBank: summarizeProfileBank(updatedProfileBank)
  });
}
