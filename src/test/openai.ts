import type { Mock } from "vitest";

export function mockOpenAITextResponse(mock: Mock, outputText: string) {
  mock.mockResolvedValueOnce({
    output_text: outputText
  });
}

export function mockOpenAIJsonResponse(mock: Mock, value: unknown) {
  mockOpenAITextResponse(mock, JSON.stringify(value));
}
