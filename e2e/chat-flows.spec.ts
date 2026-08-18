import { PrismaClient } from "@prisma/client";
import { expect, test, type Page, type Route } from "@playwright/test";

const prisma = new PrismaClient();
const createdEmails: string[] = [];

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

const profileBank = {
  sourceCount: 0,
  checklist: [],
  intake: {
    activeStep: null,
    nextPrompt: "Add your profile details.",
    completedCount: 0,
    totalCount: 0,
    complete: false
  },
  hasMasterProfile: false,
  sections: [],
  completeness: 0,
  missingSections: [],
  evidenceCounts: {
    education: 0,
    experience: 0,
    projects: 0,
    research: 0,
    skills: 0,
    evidence: 0
  }
};

const application = {
  id: "app-e2e-1",
  company: "Example AI",
  role: "AI Engineer",
  slug: "example-ai-ai-engineer",
  status: "draft",
  nextAction: "Tailor CV",
  archivedAt: null,
  createdAt: "2026-08-18T12:00:00.000Z",
  updatedAt: "2026-08-18T12:00:00.000Z",
  jobPost: {
    source: "pasted_job_description",
    sourceUrl: null,
    content: "Example AI is hiring an AI Engineer to build production LLM workflows.",
    capturedAt: "2026-08-18T12:00:00.000Z"
  },
  jobSummary: {
    requirements: ["Python", "LLM evaluation"],
    responsibilities: ["Build production agent workflows"],
    keywords: ["AI", "LLM", "Python"]
  },
  memory: {},
  notes: { entries: [] },
  drafts: {},
  artifacts: []
};

async function signUpAndSignIn(page: Page) {
  const email = `cvhelp-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = "correct-horse-battery-2026";
  createdEmails.push(email);

  const signup = await page.request.post("/api/signup", {
    data: {
      name: "E2E User",
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
}

async function mockWorkspaceApis(page: Page) {
  let applications = [] as typeof application[];
  let profileHandoffCreated = false;

  await page.route("**/api/applications", async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        applications
      })
    });
  });

  await page.route("**/api/applications/app-e2e-1", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        application
      })
    });
  });

  await page.route("**/api/profile", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: {},
        profileBank,
        sources: []
      })
    });
  });

  await page.route("**/api/chat?**", async (route: Route) => {
    const url = new URL(route.request().url());
    const mode = url.searchParams.get("mode");
    const isApplication = mode === "application";
    const isProfile = mode === "build_profile";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversationId: isApplication ? "conversation-app" : isProfile ? "conversation-profile" : "conversation-general",
        messages:
          isProfile && profileHandoffCreated
            ? [
                {
                  id: "handoff-message",
                  role: "assistant",
                  content:
                    "General Chat handoff: Confirm the user's one-page CV preference before saving it globally.",
                  metadata: null,
                  createdAt: "2026-08-18T12:00:00.000Z"
                }
              ]
            : [],
        profileBank: isApplication || isProfile ? profileBank : null,
        application: isApplication ? application : null
      })
    });
  });

  await page.route("**/api/chat", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = await route.request().postDataJSON();
    const message = String(body.message ?? "");
    const createsApplication = /is hiring|job description/i.test(message);
    const createsHandoff = /profile|one-page|one page/i.test(message);

    if (createsApplication) {
      applications = [application];
    }
    if (createsHandoff) {
      profileHandoffCreated = true;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversationId: "conversation-general",
        profileBank: null,
        application: null,
        messages: [
          {
            id: "user-message",
            role: "user",
            content: message,
            metadata: null,
            createdAt: "2026-08-18T12:00:00.000Z"
          },
          {
            id: "assistant-message",
            role: "assistant",
            content: createsApplication
              ? "Created a new application for Example AI - AI Engineer."
              : "I added a short handoff note to your Profile Chat.",
            metadata: {
              actions: createsApplication
                ? [
                    {
                      type: "open_application_chat",
                      label: "Open application chat",
                      applicationId: "app-e2e-1"
                    }
                  ]
                : [
                    {
                      type: "continue_in_profile_chat",
                      label: "Continue in Profile Chat",
                      conversationId: "conversation-profile"
                    }
                  ]
            },
            createdAt: "2026-08-18T12:00:01.000Z"
          }
        ]
      })
    });
  });
}

function collectClientErrors(page: Page) {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  return errors;
}

async function expectNoKeyControlOverflow(page: Page) {
  const overflowing = await page.locator(
    ".nav-section-toggle, .nav-subitem, .add-application-button, .application-folder-button, .message-actions button, .composer input, .composer button"
  ).evaluateAll((elements) =>
    elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
      })
      .filter((element) => element.scrollWidth > element.clientWidth + 2)
      .map((element) => element.textContent?.trim() || element.getAttribute("aria-label") || element.tagName)
  );

  expect(overflowing).toEqual([]);
}

test("General Chat routes application creation into the new application chat", async ({ page }) => {
  const clientErrors = collectClientErrors(page);
  await mockWorkspaceApis(page);
  await signUpAndSignIn(page);

  await expect(page.getByRole("button", { name: "General Intake and routing" })).toBeVisible();
  await page.getByRole("button", { name: "General Intake and routing" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
  await expect(
    page.getByText("Paste a job description, compare saved applications, or ask a broader career question.")
  ).toBeVisible();

  await page
    .getByPlaceholder("Paste a job, ask about applications, or route a profile update...")
    .fill("Example AI is hiring an AI Engineer. Requirements include Python and LLM evaluation.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: "Open application chat" }).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Example AI - AI Engineer" })).toBeVisible();
  await expect(page.getByLabel("Workspace status").getByText("Example AI", { exact: true })).toBeVisible();
  await expect(page.getByText("AI Engineer").first()).toBeVisible();
  await expectNoKeyControlOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("General Chat routes profile changes into Profile Chat with context", async ({ page }) => {
  const clientErrors = collectClientErrors(page);
  await mockWorkspaceApis(page);
  await signUpAndSignIn(page);

  await page.getByRole("button", { name: "General Intake and routing" }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByPlaceholder("Paste a job, ask about applications, or route a profile update...")
    .fill("For my profile, I prefer one-page CVs with concise bullets.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: "Continue in Profile Chat" }).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Build profile" })).toBeVisible();
  await expect(page.getByText("General Chat handoff: Confirm the user's one-page CV preference")).toBeVisible();
  await expectNoKeyControlOverflow(page);
  expect(clientErrors).toEqual([]);
});
