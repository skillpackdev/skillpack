export type PatchTextResult =
  | {
      content: string;
      matchCount: number;
      ok: true;
    }
  | {
      code: "patch-string-ambiguous" | "patch-string-not-found";
      message: string;
      ok: false;
    };

export const applyTextPatch = (
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false
): PatchTextResult => {
  if (!oldString) {
    return {
      code: "patch-string-not-found",
      message: "old_string is required for patch.",
      ok: false,
    };
  }

  const matchCount = content.split(oldString).length - 1;

  if (matchCount === 0) {
    const preview =
      content.length > 500 ? `${content.slice(0, 500)}...` : content;

    return {
      code: "patch-string-not-found",
      message: `old_string not found in file. Include more surrounding context to match exactly. File preview:\n${preview}`,
      ok: false,
    };
  }

  if (!replaceAll && matchCount > 1) {
    return {
      code: "patch-string-ambiguous",
      message: `old_string matched ${matchCount} times. Include more surrounding context for a unique match, or set replace_all to true.`,
      ok: false,
    };
  }

  return {
    content: replaceAll
      ? content.replaceAll(oldString, newString)
      : content.replace(oldString, newString),
    matchCount,
    ok: true,
  };
};
