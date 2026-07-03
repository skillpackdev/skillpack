import { z } from "zod";

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const hasLowercaseLetterPattern = /[a-z]/u;

export const skillNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    skillNamePattern,
    "Skill name must use lowercase letters, numbers, and hyphens"
  )
  .regex(hasLowercaseLetterPattern, "Skill name must include a letter");
export const skillDescriptionSchema = z.string().min(1).max(1024);
export const skillCompatibilitySchema = z.string().min(1).max(500);
export const skillLicenseSchema = z.string().min(1).max(500);
export const skillAllowedToolsSchema = z.string().min(1).max(1000);
export const skillMetadataSchema = z.record(z.string().min(1), z.string());
export const optionalSkillAllowedToolsSchema =
  skillAllowedToolsSchema.optional();
export const optionalSkillCompatibilitySchema =
  skillCompatibilitySchema.optional();
export const optionalSkillLicenseSchema = skillLicenseSchema.optional();

const isSafeRelativePath = (path: string) =>
  !path.startsWith("/") &&
  !path.includes("\\") &&
  path.split("/").every((part) => part && part !== "." && part !== "..");

export const safeRelativePathSchema = z
  .string()
  .min(1)
  .max(240)
  .refine(isSafeRelativePath, "Path must be a safe relative path");
