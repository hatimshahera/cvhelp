export const cvTextFixture = [
  "Hatim Shaherawala",
  "AI Engineer",
  "",
  "Experience",
  "- Built AI API Gateway, a request routing and monitoring service for LLM applications.",
  "- Developed internal tools with TypeScript, Python, and PostgreSQL.",
  "",
  "Projects",
  "- AI API Gateway: model routing, usage tracking, and prompt workflow support.",
  "",
  "Education",
  "- Computer Science background.",
  "",
  "Skills",
  "- TypeScript, Python, Next.js, PostgreSQL, OpenAI APIs"
].join("\n");

export const parsedCvProfileFixture = {
  identity: {
    name: "Hatim Shaherawala",
    headline: "AI Engineer"
  },
  projects: [
    {
      name: "AI API Gateway",
      summary: "Request routing and monitoring service for LLM applications.",
      technologies: ["TypeScript", "Python", "PostgreSQL"]
    }
  ],
  skills: ["TypeScript", "Python", "Next.js", "PostgreSQL", "OpenAI APIs"]
};
