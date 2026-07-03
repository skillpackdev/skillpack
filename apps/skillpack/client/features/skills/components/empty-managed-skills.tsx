import { Link } from "@tanstack/react-router";
import { FileTextIcon, PlusIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { getLibraryActions } from "../lib/library-surface";

interface EmptyManagedSkillsProps {
  status: string;
  onRefresh: () => void;
}

export const EmptyManagedSkills = ({
  status,
  onRefresh,
}: EmptyManagedSkillsProps) => {
  const [primaryAction, secondaryAction] = getLibraryActions(
    "Create your first skill"
  );

  return (
    <Card className="mx-auto w-full max-w-3xl border border-dashed border-border bg-card shadow-none">
      <CardHeader className="gap-3 text-center sm:text-left">
        <div className="flex justify-center sm:justify-start">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <FileTextIcon />
          </div>
        </div>
        <div className="grid gap-1">
          <CardTitle>No managed skills yet</CardTitle>
          <CardDescription className="max-w-2xl leading-6">
            Start by adding a skill from GitHub or by authoring one directly in
            Skillpack.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">{status}</p>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            className="w-full sm:w-auto"
            nativeButton={false}
            render={<Link to={primaryAction.to} />}
          >
            <PlusIcon data-icon="inline-start" />
            {primaryAction.label}
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            nativeButton={false}
            render={<Link to={secondaryAction.to} />}
          >
            <PlusIcon data-icon="inline-start" />
            {secondaryAction.label}
          </Button>
        </div>
        <Button
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={() => {
            void onRefresh();
          }}
        >
          <RefreshCwIcon data-icon="inline-start" />
          Refresh list
        </Button>
      </CardFooter>
    </Card>
  );
};
