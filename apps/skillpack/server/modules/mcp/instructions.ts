export const skillpackMcpInstructions = [
  "Use this server to find and load skills hosted by Skillpack, a remote Agent Skills management system.",
  "At the start of each new user task, call list_skills once. Select relevant skills by matching the task to skill names and descriptions.",
  "For each relevant skill, call read_skill with its skill:// location before planning, editing files, running commands, or calling task-specific tools. Treat the returned SKILL.md as active task guidance for this task.",
  "When a loaded SKILL.md references attached files, call read_skill again with the resource path to load the needed reference, script, example, or asset.",
  "When the user provides a skill:// location, call read_skill for that location.",
  "Use create_skill and update_skill when the user asks to create, improve, or maintain Skillpack skills. Read the existing skill before update_skill. In updates, omitted fields and resources remain unchanged; deleteResourcePaths removes attachments; upsertResources adds or replaces attachments.",
  "Resolve skill:// URIs through Skillpack MCP tools or resources.",
].join(" ");
