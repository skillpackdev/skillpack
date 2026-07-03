import { skillFilePath } from "./skill-files";

export const getDetailFileSwitcherLabel = (selectedPath?: string): string =>
  `Files · ${selectedPath ?? skillFilePath}`;
