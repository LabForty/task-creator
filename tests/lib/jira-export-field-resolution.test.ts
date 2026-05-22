import { describe, it, expect } from "vitest";
import {
  findEpicLinkField,
  findFlaggedField,
  findLabelsField,
} from "@/lib/jira/export";

describe("export field resolution", () => {
  it("findEpicLinkField returns parent for team-managed (modern) projects", () => {
    const fields = {
      parent: { required: false, name: "Parent" },
      summary: { required: true, name: "Summary" },
    };
    expect(findEpicLinkField(fields)).toEqual({ id: "parent", mode: "parent" });
  });

  it("findEpicLinkField returns the epic-link custom field for company-managed projects", () => {
    const fields = {
      customfield_10014: {
        required: false,
        name: "Epic Link",
        schema: { type: "any", custom: "com.pyxis.greenhopper.jira:gh-epic-link" },
      },
    };
    expect(findEpicLinkField(fields)).toEqual({ id: "customfield_10014", mode: "epic-link" });
  });

  it("findEpicLinkField returns null when neither is present", () => {
    expect(findEpicLinkField({ summary: { required: true, name: "Summary" } })).toBeNull();
  });

  it("findFlaggedField matches the Flagged system field by name", () => {
    const fields = {
      customfield_10021: {
        required: false,
        name: "Flagged",
        schema: { type: "array", items: "option" },
      },
    };
    expect(findFlaggedField(fields)).toEqual({ id: "customfield_10021" });
  });

  it("findFlaggedField returns null when no Flagged field exists", () => {
    expect(findFlaggedField({ summary: { required: true, name: "Summary" } })).toBeNull();
  });

  it("findLabelsField returns true when the system labels field exists", () => {
    expect(findLabelsField({ labels: { required: false, name: "Labels" } })).toBe(true);
    expect(findLabelsField({})).toBe(false);
  });
});
