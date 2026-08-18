import { describe, expect, it } from "vitest";
import { parseChatMessageMetadata } from "./actions";

describe("chat actions", () => {
  it("parses persisted assistant actions", () => {
    expect(
      parseChatMessageMetadata({
        actions: [
          {
            type: "open_application_chat",
            label: "Open application chat",
            applicationId: "app-1"
          }
        ]
      })
    ).toEqual({
      actions: [
        {
          type: "open_application_chat",
          label: "Open application chat",
          applicationId: "app-1"
        }
      ]
    });
  });

  it("drops malformed action metadata safely", () => {
    expect(parseChatMessageMetadata({ actions: [{ type: "delete_everything" }] })).toEqual({
      actions: []
    });
  });
});
