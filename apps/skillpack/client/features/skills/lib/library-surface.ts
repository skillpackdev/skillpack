import { addSkillPath, createSkillPath } from "./routes";

interface LibraryActionDefinition {
  kind: "primary" | "secondary";
  label: string;
  to: string;
}

export const getLibraryActions = (
  secondaryLabel = "Create Skill"
): LibraryActionDefinition[] => [
  {
    kind: "primary",
    label: "Add to Library",
    to: addSkillPath,
  },
  {
    kind: "secondary",
    label: secondaryLabel,
    to: createSkillPath,
  },
];
