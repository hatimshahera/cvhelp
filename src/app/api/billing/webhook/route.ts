import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook handling is not configured yet." },
      { status: 501 }
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  return NextResponse.json(
    { error: "Stripe webhook verification is planned but not connected yet." },
    { status: 501 }
  );
}
