import { looksLikeProfileHandoffRequest } from "@/lib/chat/handoffs";
import { looksLikeJobSource } from "@/lib/tools/application-actions";

const lightweightGeneralPatterns = [
  /^(hi|hello|hey|yo|hiya|sup)(\s+there)?[!.?\s]*$/i,
  /^(hi|hello|hey|yo|hiya|sup)(\s+there)?[,!\s]+(?:does this work|is this working|can you hear me|are you working)[?.!\s]*$/i,
  /^(does this work|is this working|testing|test|ping|can you hear me)[?.!\s]*$/i,
  /^(thanks|thank you|cheers|ok|okay|cool|great)[!.?\s]*$/i
];

const workspaceIntentPattern =
  /\b(applications?|jobs?|roles?|workspace|compare|status|archive|restore|rename|submitted|interview|drafts?|next action|which one|pipeline|saved jobs?)\b/i;

export function isLightweightGeneralMessage(message: string) {
  const trimmed = message.trim();
  return Boolean(trimmed) && lightweightGeneralPatterns.some((pattern) => pattern.test(trimmed));
}

export function getLightweightGeneralReply(message: string, userName: string | null) {
  const lower = message.trim().toLowerCase();
  const name = userName?.trim() ? ` ${userName.trim()}` : "";

  if (/^(thanks|thank you|cheers)/i.test(lower)) {
    return "You're welcome.";
  }

  if (/^(ok|okay|cool|great)/i.test(lower)) {
    return "Got it.";
  }

  return `Hi${name}. Yes, it works. You can paste a job description here, ask a career question, or route profile updates.`;
}

export function shouldIncludeGeneralWorkspaceContext({
  message,
  hasAttachedSources
}: {
  message: string;
  hasAttachedSources: boolean;
}) {
  if (isLightweightGeneralMessage(message)) return false;
  if (hasAttachedSources) return true;
  if (looksLikeJobSource(message)) return true;
  if (looksLikeProfileHandoffRequest(message)) return true;

  return workspaceIntentPattern.test(message);
}
