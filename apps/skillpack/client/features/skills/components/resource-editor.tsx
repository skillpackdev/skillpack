import { lazy, Suspense, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { validateNewResourcePath } from "../lib/resource-drafts";
import type { ResourceFileContent } from "../lib/resource-file-selection";
import { getSkillResourceKind } from "../lib/resource-kind";
import type { SkillFile } from "../lib/skill-files";
import { ResourceViewer, SkillDescription } from "./resource-viewer";

const CodeEditor = lazy(async () => {
  const module = await import("./code-editor");
  return { default: module.CodeEditor };
});

interface ResourceEditorProps {
  canEdit: boolean;
  canEditDescription?: boolean;
  descriptionValue?: string;
  existingPaths?: Set<string>;
  file: ResourceFileContent | undefined;
  preferEdit?: boolean;
  rawUrl: string | undefined;
  resource: SkillFile | undefined;
  showMeta?: boolean;
  showRename?: boolean;
  status: string;
  value: string;
  onChange: (value: string) => void;
  onDescriptionChange?: (description: string) => void;
  onRename?: (nextPath: string) => void;
}

type ResourceEditorMode = "edit" | "preview";

const isResourceEditorMode = (value: string): value is ResourceEditorMode =>
  value === "edit" || value === "preview";

const ResourceEditorHeader = ({
  existingPaths,
  mode,
  resource,
  showRename,
  supportsPreview,
  onModeChange,
  onRename,
}: {
  existingPaths: Set<string>;
  mode: ResourceEditorMode;
  resource: SkillFile;
  showRename: boolean;
  supportsPreview: boolean;
  onModeChange: (mode: ResourceEditorMode) => void;
  onRename: ((nextPath: string) => void) | undefined;
}) => {
  const [pathDraft, setPathDraft] = useState(resource.path);
  const otherPaths = new Set(existingPaths);
  otherPaths.delete(resource.path);
  const trimmedPath = pathDraft.trim();
  const renameError =
    showRename && trimmedPath !== resource.path
      ? validateNewResourcePath(trimmedPath, otherPaths)
      : null;

  useEffect(() => {
    setPathDraft(resource.path);
  }, [resource.path]);

  const commitRename = () => {
    if (
      !showRename ||
      renameError ||
      !trimmedPath ||
      trimmedPath === resource.path
    ) {
      setPathDraft(resource.path);
      return;
    }

    onRename?.(trimmedPath);
  };

  return (
    <div className="flex min-h-14 shrink-0 flex-col items-start justify-between gap-3 border-b border-border bg-background px-4 py-3 md:flex-row md:items-center md:gap-4 md:px-6 md:py-0">
      <div className="min-w-0 text-sm text-muted-foreground">
        {showRename ? (
          <Input
            aria-label="Resource file name"
            aria-invalid={Boolean(renameError)}
            className="inline-flex h-8 w-full max-w-full font-medium text-foreground md:w-[min(42rem,60vw)]"
            value={pathDraft}
            onBlur={commitRename}
            onChange={(event) => setPathDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <span className="truncate font-medium text-foreground">
            {resource.path}
          </span>
        )}
        {renameError ? (
          <span className="mt-2 block text-destructive md:mt-0 md:ml-3 md:inline">
            {renameError}
          </span>
        ) : null}
      </div>
      {supportsPreview ? (
        <Tabs
          value={mode}
          onValueChange={(value) => {
            if (isResourceEditorMode(value)) {
              onModeChange(value);
            }
          }}
          className="w-full shrink-0 md:w-auto"
        >
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
    </div>
  );
};

export const ResourceEditor = ({
  canEdit,
  canEditDescription,
  descriptionValue,
  existingPaths = new Set(),
  file,
  preferEdit = false,
  rawUrl,
  resource,
  showMeta = true,
  showRename = false,
  status,
  value,
  onChange,
  onDescriptionChange,
  onRename,
}: ResourceEditorProps) => {
  const [mode, setMode] = useState<ResourceEditorMode>("preview");
  const previewFile = file ? { ...file, content: value } : file;
  const supportsPreview = Boolean(
    resource && getSkillResourceKind(resource) === "markdown"
  );

  useEffect(() => {
    if (preferEdit || !supportsPreview) {
      setMode("edit");
    }
  }, [preferEdit, resource?.path, supportsPreview]);

  if (!(resource && canEdit)) {
    return (
      <ResourceViewer
        file={file}
        rawUrl={rawUrl}
        resource={resource}
        showMeta={showMeta}
        status={status}
      />
    );
  }

  const previewResource = {
    ...resource,
    description: canEditDescription ? undefined : resource.description,
    size: previewFile?.size ?? resource.size,
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      <ResourceEditorHeader
        existingPaths={existingPaths}
        mode={mode}
        resource={resource}
        showRename={showRename}
        supportsPreview={supportsPreview}
        onModeChange={setMode}
        onRename={onRename}
      />
      {canEditDescription ? (
        <SkillDescription
          canEditDescription
          description={descriptionValue ?? resource.description ?? ""}
          onDescriptionChange={onDescriptionChange}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {mode === "edit" || !supportsPreview ? (
          <Suspense
            fallback={
              <p className="px-4 py-4 text-sm text-muted-foreground md:px-6">
                Loading editor...
              </p>
            }
          >
            <CodeEditor
              key={resource.path}
              ariaLabel={`Edit ${resource.path}`}
              mediaType={resource.mediaType}
              path={resource.path}
              value={value}
              onChange={onChange}
            />
          </Suspense>
        ) : (
          <ResourceViewer
            file={previewFile}
            rawUrl={rawUrl}
            resource={previewResource}
            showMeta={false}
            status={status}
          />
        )}
      </div>
    </section>
  );
};
