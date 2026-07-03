import { ChevronDownIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import { formatBytes } from "../lib/format-bytes";
import type { ResourceFileContent } from "../lib/resource-file-selection";
import {
  getSkillResourceKind,
  getSkillResourceLanguage,
} from "../lib/resource-kind";
import type { SkillFile } from "../lib/skill-files";

interface ResourceViewerProps {
  canEditDescription?: boolean;
  descriptionValue?: string;
  file: ResourceFileContent | undefined;
  rawUrl: string | undefined;
  resource: SkillFile | undefined;
  showMeta?: boolean;
  status: string;
  onDescriptionChange?: (description: string) => void;
}

interface ResourceBodyProps {
  file: ResourceFileContent | undefined;
  kind: ReturnType<typeof getSkillResourceKind>;
  rawUrl: string | undefined;
  resource: SkillFile;
  status: string;
}

const loadMarkdownContent = async () => {
  const module = await import("./markdown-content");
  return { default: module.MarkdownContent };
};

const loadCodeResource = async () => {
  const module = await import("./code-resource");
  return { default: module.CodeResource };
};

const MarkdownContent = lazy(loadMarkdownContent);
const CodeResource = lazy(loadCodeResource);

export const ResourceMeta = ({ resource }: { resource: SkillFile }) => (
  <div className="hidden min-h-14 shrink-0 items-center gap-0 border-b border-border bg-background px-6 py-0 text-sm text-muted-foreground md:flex">
    <span className="truncate font-medium text-foreground">
      {resource.path}
    </span>
    <span className="hidden md:mx-2 md:block">·</span>
    <span>{formatBytes(resource.size)}</span>
  </div>
);

export const SkillDescription = ({
  canEditDescription,
  description,
  onDescriptionChange,
}: {
  canEditDescription?: boolean;
  description: string;
  onDescriptionChange?: (description: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const preview = description.trim() || "No description yet.";
  const descriptionContent = canEditDescription ? (
    <Textarea
      aria-label="Skill description"
      className="max-w-3xl md:min-h-0"
      value={description}
      onChange={(event) => onDescriptionChange?.(event.target.value)}
    />
  ) : (
    <div className="whitespace-pre-wrap text-sm leading-6 md:text-base">
      {description}
    </div>
  );

  return (
    <>
      <div className="hidden shrink-0 border-b border-border bg-background md:block">
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="w-28 py-3 pr-4 pl-6 text-muted-foreground">
                description
              </TableCell>
              <TableCell className="py-3 pr-6 pl-0 whitespace-normal text-foreground">
                {descriptionContent}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="shrink-0 border-b border-border bg-background md:hidden"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Description</p>
            {open ? null : (
              <p className="truncate text-sm text-muted-foreground">
                {preview}
              </p>
            )}
          </div>
          <CollapsibleTrigger
            render={<Button type="button" variant="ghost" size="sm" />}
          >
            {open ? "Hide" : "Show"}
            <ChevronDownIcon
              data-icon="inline-end"
              className={open ? "rotate-180" : undefined}
            />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="py-3 pr-4 pl-4 whitespace-normal text-foreground">
                  {descriptionContent}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
};

const ResourceBody = ({
  file,
  kind,
  rawUrl,
  resource,
  status,
}: ResourceBodyProps) => {
  if (kind === "image" && rawUrl) {
    return (
      <div className="p-4 md:p-6">
        <img
          src={rawUrl}
          alt={`Resource ${resource.path}`}
          className="max-h-[70vh] max-w-full rounded-lg border border-border object-contain"
        />
      </div>
    );
  }

  if (kind === "markdown") {
    return (
      <Suspense
        fallback={
          <p className="px-4 py-4 text-sm text-muted-foreground md:px-6">
            Loading markdown preview...
          </p>
        }
      >
        <MarkdownContent content={file?.content} fallback={status} />
      </Suspense>
    );
  }

  if (kind === "code" && file?.content) {
    return (
      <Suspense
        fallback={
          <p className="px-4 py-4 text-sm text-muted-foreground md:px-6">
            Loading code preview...
          </p>
        }
      >
        <CodeResource
          content={file.content}
          language={getSkillResourceLanguage(resource.path)}
        />
      </Suspense>
    );
  }

  if (kind === "code") {
    return (
      <p className="px-4 py-4 text-sm text-muted-foreground md:px-6">
        {status}
      </p>
    );
  }

  return (
    <pre className="whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-foreground md:px-6">
      {file?.content ?? status}
    </pre>
  );
};

export const ResourceViewer = ({
  canEditDescription,
  descriptionValue,
  file,
  rawUrl,
  resource,
  showMeta = true,
  status,
  onDescriptionChange,
}: ResourceViewerProps) => {
  if (!resource) {
    return (
      <p className="px-4 py-4 text-sm text-muted-foreground md:px-6">
        {status}
      </p>
    );
  }

  const kind = getSkillResourceKind(resource);
  const showDescription =
    kind === "markdown" &&
    (canEditDescription || resource.description !== undefined);

  return (
    <section className="flex h-full min-h-0 flex-col">
      {showMeta ? <ResourceMeta resource={resource} /> : null}
      {showDescription ? (
        <SkillDescription
          canEditDescription={canEditDescription}
          description={descriptionValue ?? resource.description ?? ""}
          onDescriptionChange={onDescriptionChange}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <ResourceBody
          file={file}
          kind={kind}
          rawUrl={rawUrl}
          resource={resource}
          status={status}
        />
      </div>
    </section>
  );
};
