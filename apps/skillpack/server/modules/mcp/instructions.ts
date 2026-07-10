export const skillpackMcpInstructions = [
  "Use this server to find and load skills hosted by Skillpack, a remote Agent Skills management system.",
  "At the start of each new user task, call list_skills once. Select relevant skills by matching the task to skill names and descriptions.",
  "For each relevant skill, call read_skill with its Skill Name before planning, editing files, running commands, or calling task-specific tools. Treat the returned SKILL.md as active task guidance for this task.",
  "When a loaded SKILL.md references attached files, call MCP resources/read with the full skill:// resource URI to load the needed reference, script, example, or asset.",
  "When the user provides a skill:// location, resolve it through MCP resources/read.",
  "Use manage_skill when the user asks to create, improve, or maintain Skillpack skills. Read the existing skill with read_skill before patch or edit. Prefer manage_skill action patch for targeted changes; use edit for full SKILL.md rewrites; use write_file and remove_file for attached resources.",
  "Resolve skill:// URIs through Skillpack MCP tools or resources.",
].join(" ");
