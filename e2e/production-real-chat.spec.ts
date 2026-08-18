import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const runRealChat = process.env.CVHELP_E2E_REAL_CHAT === "1";
const prisma = new PrismaClient();
const createdEmails: string[] = [];

test.skip(!runRealChat, "Set CVHELP_E2E_REAL_CHAT=1 to run production smoke tests against real chat APIs.");

test.afterEach(async () => {
  if (!createdEmails.length) return;
  const emails = createdEmails.splice(0, createdEmails.length);
  await prisma.user.deleteMany({
    where: {
      email: {
        in: emails
      }
    }
  });
});

test("production real chat creates an application and routes profile handoff", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `cvhelp-prod-real-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = "correct-horse-battery-2026";
  const clientErrors: string[] = [];
  createdEmails.push(email);

  page.on("console", (message) => {
    if (message.type() === "error") clientErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    clientErrors.push(error.message);
  });

  const signup = await page.request.post("/api/signup", {
    data: {
      name: "Production Smoke User",
      email,
      password
    }
  });
  expect(signup.ok()).toBeTruthy();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/app");

  await page.getByRole("button", { name: "General Intake and routing" }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByPlaceholder("Paste a job, ask about applications, or route a profile update...")
    .fill(
      "Example Smoke Labs is hiring an AI Workflow Engineer. Requirements include Python, TypeScript, LLM evaluation, RAG, backend APIs, and production agent workflows."
    );
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Open application chat" })).toBeVisible({
    timeout: 45_000
  });
  await page.getByRole("button", { name: "Open application chat" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Example Smoke Labs|Unknown company/ })).toBeVisible({
    timeout: 15_000
  });

  await page.getByRole("button", { name: "General Intake and routing" }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByPlaceholder("Paste a job, ask about applications, or route a profile update...")
    .fill("For my profile, I prefer concise one-page CVs with direct bullets.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Continue in Profile Chat" })).toBeVisible({
    timeout: 45_000
  });
  await page.getByRole("button", { name: "Continue in Profile Chat" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Build profile" })).toBeVisible();
  await expect(page.getByText("General Chat handoff:")).toBeVisible();
  expect(clientErrors).toEqual([]);
});
