import { looksLikeProfileHandoffRequest } from "@/lib/chat/handoffs";
import { looksLikeJobSource } from "@/lib/tools/application-actions";

export type GeneralWorkspaceTool =
  | "list_applications"
  | "search_applications"
  | "get_profile"
  | "search_profile"
  | "search_sources";

export type GeneralChatIntent =
  | "casual"
  | "workspace_overview"
  | "application_lookup"
  | "profile_lookup"
  | "source_lookup"
  | "job_source"
  | "profile_handoff"
  | "ambiguous";

export type GeneralChatContextPlan = {
  intent: GeneralChatIntent;
  workspaceTools: GeneralWorkspaceTool[];
  reason: string;
};

const casualPatterns = [
  /^(hi|hello|hey|yo|yo yo|yo yo yo|sup|hiya|howdy)[\s!.?]*$/i,
  /^(thanks|thank you|thx|cheers|nice|cool|ok|okay|got it|sounds good)[\s!.?]*$/i,
  /^(does this work|test|testing|ping)[\s!.?]*$/i
];

const applicationTerms =
  /\b(applications?|apps?|roles?|jobs?|drafts?|submitted|interviewing|rejected|archiv(?:e|ed)|status|next action|compare|pipeline|workspace)\b/i;
const profileTerms =
  /\b(profile|career bank|global facts?|preferences?|cv preferences?|resume preferences?|tone|formatting|bullet style|page limit|avoid|linkedin|github|education|experience|skills?)\b/i;
const sourceTerms =
  /\b(sources?|files?|uploads?|attachments?|evidence|documents?|job source|uploaded)\b/i;
const readIntentTerms =
  /\b(list|show|find|search|get|pull up|look up|what|which|compare|review|summari[sz]e|open)\b/i;
const ambiguousWorkspaceTerms = /\b(next|todo|priority|prioriti[sz]e|should i do)\b/i;

function uniqueTools(tools: GeneralWorkspaceTool[]) {
  return Array.from(new Set(tools));
}

export function planGeneralChatContext(message: string): GeneralChatContextPlan {
  const text = message.trim();

  if (looksLikeJobSource(text)) {
    return {
      intent: "job_source",
      workspaceTools: [],
      reason: "The user provided a likely job source; deterministic application creation can handle it."
    };
  }

  if (casualPatterns.some((pattern) => pattern.test(text))) {
    return {
      intent: "casual",
      workspaceTools: [],
      reason: "The message is conversational and does not require workspace context."
    };
  }

  const wantsRead = readIntentTerms.test(text);
  const tools: GeneralWorkspaceTool[] = [];

  if (applicationTerms.test(text) && wantsRead) {
    tools.push(text.length > 80 || /\b(search|find|compare|review|which)\b/i.test(text) ? "search_applications" : "list_applications");
  }

  if (profileTerms.test(text) && wantsRead) {
    tools.push(text.length > 80 || /\b(search|find|about|evidence|skills?|experience|education|github|linkedin)\b/i.test(text) ? "search_profile" : "get_profile");
  }

  if (sourceTerms.test(text) && wantsRead) {
    tools.push("search_sources");
  }

  if (tools.length) {
    return {
      intent: tools.includes("get_profile") || tools.includes("search_profile")
        ? "profile_lookup"
        : tools.includes("search_sources")
          ? "source_lookup"
          : applicationTerms.test(text)
            ? "application_lookup"
            : "workspace_overview",
      workspaceTools: uniqueTools(tools),
      reason: "The user is asking for specific workspace information."
    };
  }

  if (looksLikeProfileHandoffRequest(text)) {
    return {
      intent: "profile_handoff",
      workspaceTools: [],
      reason: "The user is asking to update reusable profile facts or preferences."
    };
  }

  if (ambiguousWorkspaceTerms.test(text) && !applicationTerms.test(text) && !profileTerms.test(text)) {
    return {
      intent: "ambiguous",
      workspaceTools: [],
      reason: "The request may need workspace context, but the target scope is unclear."
    };
  }

  return {
    intent: "casual",
    workspaceTools: [],
    reason: "No workspace-specific intent was detected."
  };
}
