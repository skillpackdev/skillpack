import type { SkillOriginInput } from "@skillpack/contracts/origins/requests";
import type {
  DiscoverSkillsResponse,
  OriginSkillCandidate,
  OriginSkillDefinitionPreview,
} from "@skillpack/contracts/origins/responses";
import type { ForkSkillInput } from "@skillpack/contracts/skills/requests";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CircleAlertIcon,
  FileTextIcon,
  PlusIcon,
} from "lucide-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { useOriginSkillDefinition } from "../api/use-origin-skill-definition";
import { getForkSelectionStatus } from "../lib/fork-surface";

interface SkillForkViewProps {
  discovery: DiscoverSkillsResponse | undefined;
  existingSkillNames: readonly string[];
  origin: SkillOriginInput;
  status: string;
  onComplete: () => void;
  onSubmit: (input: ForkSkillInput) => Promise<void>;
}

type ForkOrigin = ForkSkillInput["origin"];

const loadResourceViewer = async () => {
  const module = await import("../components/resource-viewer");
  return { default: module.ResourceViewer };
};

const ResourceViewer = lazy(loadResourceViewer);

const getPinnedOrigin = (
  discovery: DiscoverSkillsResponse | undefined
): ForkOrigin | undefined => {
  if (!discovery) {
    return;
  }

  if (discovery.resolvedOrigin.kind === "github") {
    return {
      branch: discovery.resolvedOrigin.branch,
      kind: "github",
      repoUrl: discovery.resolvedOrigin.repoUrl,
      rev: discovery.resolvedOrigin.rev,
    };
  }

  return discovery.resolvedOrigin;
};

const getCandidateKey = (candidate: OriginSkillCandidate) =>
  candidate.path ?? candidate.selection.skillName;

const getCandidateClassName = (isActive: boolean) =>
  cn(
    "flex min-w-0 items-start gap-3 border-b border-border px-4 py-3 text-sm",
    isActive ? "bg-muted text-foreground" : "hover:bg-muted/40"
  );

const getPreviewStatus = ({
  activeCandidate,
  discovery,
  error,
  isLoading,
  result,
  status,
}: {
  activeCandidate: OriginSkillCandidate | undefined;
  discovery: DiscoverSkillsResponse | undefined;
  error: Error | null;
  isLoading: boolean;
  result: ReturnType<typeof useOriginSkillDefinition>["data"];
  status: string;
}) => {
  if (!activeCandidate) {
    return discovery ? "Select a skill to preview." : status;
  }

  if (isLoading) {
    return "Loading preview...";
  }

  if (result?.status === "resolved") {
    return "Select a file";
  }

  if (result?.status === "failed") {
    return result.error;
  }

  return error?.message ?? "Preview failed";
};

const DefinitionFileList = ({
  definition,
  emptyStatus,
  selectedPath,
  onSelectPath,
}: {
  definition: OriginSkillDefinitionPreview | undefined;
  emptyStatus: string;
  selectedPath: string | undefined;
  onSelectPath: (path: string) => void;
}) => {
  if (!definition) {
    return (
      <p className="border-b border-border px-4 py-3 text-sm text-muted-foreground md:border-r md:border-b-0">
        {emptyStatus}
      </p>
    );
  }

  return (
    <OverlayScrollbarsComponent
      defer
      options={{ scrollbars: { autoHide: "leave", theme: "os-theme-dark" } }}
      className="min-h-0 border-b border-border md:border-r md:border-b-0"
    >
      {definition.resources.map((resource) => (
        <button
          type="button"
          key={resource.path}
          onClick={() => onSelectPath(resource.path)}
          className={cn(
            "block w-full border-b border-border px-4 py-3 text-left text-sm",
            selectedPath === resource.path
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          )}
        >
          <span className="block truncate font-medium" title={resource.path}>
            {resource.path}
          </span>
        </button>
      ))}
    </OverlayScrollbarsComponent>
  );
};

const DefinitionPreview = ({
  definition,
  previewStatus,
}: {
  definition: OriginSkillDefinitionPreview | undefined;
  previewStatus: string;
}) => {
  const [selectedPath, setSelectedPath] = useState<string>();

  useEffect(() => {
    setSelectedPath(definition?.resources.at(0)?.path);
  }, [definition]);

  const selectedResource = definition?.resources.find(
    (resource) => resource.path === selectedPath
  );

  return (
    <section className="grid min-h-0 flex-1 md:grid-cols-[minmax(10rem,16rem)_1fr]">
      <DefinitionFileList
        definition={definition}
        emptyStatus={previewStatus}
        selectedPath={selectedPath}
        onSelectPath={setSelectedPath}
      />
      <OverlayScrollbarsComponent
        defer
        options={{ scrollbars: { autoHide: "leave", theme: "os-theme-dark" } }}
        className="min-h-0 min-w-0"
      >
        <Suspense
          fallback={
            <p className="px-6 py-4 text-muted-foreground text-sm">
              Loading resource viewer...
            </p>
          }
        >
          <ResourceViewer
            file={selectedResource}
            rawUrl={undefined}
            resource={selectedResource}
            status={selectedResource ? "Loading file..." : previewStatus}
          />
        </Suspense>
      </OverlayScrollbarsComponent>
    </section>
  );
};

export const SkillForkView = ({
  discovery,
  existingSkillNames,
  origin,
  status,
  onComplete,
  onSubmit,
}: SkillForkViewProps) => {
  const [activeSkillName, setActiveSkillName] = useState<string>();
  const [selectedSkillNames, setSelectedSkillNames] = useState<string[]>([]);
  const [submitStatus, setSubmitStatus] = useState(getForkSelectionStatus(0));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const existingSkillNameSet = useMemo(
    () => new Set(existingSkillNames),
    [existingSkillNames]
  );

  const activeCandidate = discovery?.candidates.find(
    (candidate) => candidate.selection.skillName === activeSkillName
  );
  const pinnedOrigin = useMemo(() => getPinnedOrigin(discovery), [discovery]);
  const forkOrigin = useMemo(
    () => pinnedOrigin ?? origin,
    [origin, pinnedOrigin]
  );
  const definitionPreview = useOriginSkillDefinition(
    forkOrigin,
    activeCandidate?.selection
  );
  const previewDefinition =
    definitionPreview.data?.status === "resolved"
      ? definitionPreview.data.definition
      : undefined;
  const previewStatus = getPreviewStatus({
    activeCandidate,
    discovery,
    error: definitionPreview.error,
    isLoading: definitionPreview.isLoading,
    result: definitionPreview.data,
    status,
  });
  useEffect(() => {
    const firstSkillName = discovery?.candidates.at(0)?.selection.skillName;
    setActiveSkillName(firstSkillName);
    setSelectedSkillNames([]);
    setSubmitStatus(getForkSelectionStatus(0));
  }, [discovery]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("Adding...");

    try {
      await onSubmit({
        origin: forkOrigin,
        selections: selectedSkillNames.map((skillName) => ({ skillName })),
      });
      onComplete();
    } catch (error) {
      setSubmitStatus(error instanceof Error ? error.message : "Add failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSelection = (skillName: string) => {
    setSelectedSkillNames((current) => {
      const next = current.includes(skillName)
        ? current.filter((selected) => selected !== skillName)
        : [...current, skillName];

      setSubmitStatus(getForkSelectionStatus(next.length));
      return next;
    });
  };

  return (
    <>
      <header className="border-b border-border bg-background px-4 py-3 md:px-6 md:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="md:hidden" />
          <Button
            variant="ghost"
            size="icon"
            nativeButton={false}
            render={<Link to="/skills" aria-label="Back to Library" />}
          >
            <ArrowLeftIcon />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight md:text-2xl">
              Add to Library
            </h1>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(18rem,24rem)_1fr]">
        <aside className="min-h-0 border-b border-border md:border-r md:border-b-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 md:h-12 md:py-0">
            <h2 className="text-sm font-medium">Discovered skills</h2>
            <span className="text-xs text-muted-foreground">
              {discovery?.candidates.length ?? 0} found
            </span>
          </div>
          <OverlayScrollbarsComponent
            defer
            options={{
              scrollbars: { autoHide: "leave", theme: "os-theme-dark" },
            }}
            className="max-h-[18rem] md:h-[calc(100%-3rem)] md:max-h-none"
          >
            {discovery?.candidates.length ? (
              discovery.candidates.map((candidate) => {
                const { skillName } = candidate.selection;
                const willUpdate = existingSkillNameSet.has(skillName);

                return (
                  <div
                    key={getCandidateKey(candidate)}
                    className={getCandidateClassName(
                      activeSkillName === skillName
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${candidate.name}`}
                      className="mt-1"
                      checked={selectedSkillNames.includes(skillName)}
                      disabled={isSubmitting}
                      onChange={() => toggleSelection(skillName)}
                    />
                    <div className="grid min-w-0 flex-1 gap-1">
                      <button
                        type="button"
                        onClick={() => setActiveSkillName(skillName)}
                        className="grid min-w-0 gap-1 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">
                            {candidate.name}
                          </span>
                        </span>
                        {willUpdate ? (
                          <Alert className="border-warning/40 bg-warning/10 px-2 py-1 text-warning-foreground text-xs">
                            <CircleAlertIcon />
                            <AlertTitle>Will update</AlertTitle>
                          </Alert>
                        ) : null}
                        {candidate.path ? (
                          <span className="truncate text-muted-foreground text-xs">
                            {candidate.path}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="px-4 py-3 text-muted-foreground text-sm">
                {status}
              </p>
            )}
          </OverlayScrollbarsComponent>
        </aside>

        <div className="flex min-h-0 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4 md:px-6">
            <FileTextIcon className="size-4 text-muted-foreground" />
            <h2 className="truncate text-sm font-medium">
              {previewDefinition?.name ?? activeCandidate?.name ?? "Preview"}
            </h2>
          </div>
          <DefinitionPreview
            definition={previewDefinition}
            previewStatus={previewStatus}
          />
        </div>
      </div>

      <form
        onSubmit={submit}
        className="sticky bottom-0 flex shrink-0 flex-col gap-3 border-t border-border bg-background px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6"
      >
        <p className="min-w-0 truncate text-sm text-muted-foreground">
          {submitStatus}
        </p>
        <Button
          type="submit"
          className="w-full md:w-auto"
          disabled={isSubmitting || selectedSkillNames.length === 0}
        >
          {isSubmitting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PlusIcon data-icon="inline-start" />
          )}
          {isSubmitting ? "Adding..." : "Add selected skills"}
        </Button>
      </form>
    </>
  );
};
