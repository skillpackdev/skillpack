export const skillListQueryKey = ["skills", "list"] as const;
export const skillQueryPrefix = ["skills"] as const;

export const skillDetailQueryKey = (skillName: string | undefined) =>
  ["skills", "detail", skillName] as const;

export const skillDetailQueryPrefix = (skillName: string | undefined) =>
  ["skills", "detail", skillName] as const;

export const skillFileQueryKey = (
  skillName: string | undefined,
  path: string | undefined
) => ["skills", "file", skillName, path] as const;

export const skillFileQueryPrefix = (skillName: string | undefined) =>
  ["skills", "file", skillName] as const;

export const originDiscoveryQueryKey = (originKey: string | undefined) =>
  ["origins", "discover", originKey] as const;

export const originDefinitionQueryKey = (
  originKey: string | undefined,
  skillName: string | undefined
) => ["origins", "definitions", originKey, skillName] as const;
