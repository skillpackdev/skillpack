import {
  safeRelativePathSchema,
  skillNameSchema,
} from "@skillpack/core/primitives";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import {
  skillDetailQueryKey,
  skillFileQueryPrefix,
  skillListQueryKey,
  skillSnapshotsQueryKey,
} from "@/features/skills/api/query-keys";
import { activeSkillQueryOptions } from "@/features/skills/api/query-options";
import {
  useSkillDetail,
  useSkillSnapshots,
} from "@/features/skills/api/use-skill-detail";
import {
  useCreateSkillSnapshot,
  usePatchSkill,
  useRestoreSkillSnapshot,
} from "@/features/skills/api/use-skill-mutations";
import { SkillDetailSkeleton } from "@/features/skills/components/skill-page-skeletons";
import { skillFilePath } from "@/features/skills/lib/resource-drafts";
import { SkillDetailView } from "@/features/skills/views/skill-detail-view";

const skillDetailSearchSchema = z.object({
  path: safeRelativePathSchema.optional(),
});

const skillRouteParamsSchema = z.object({
  skillName: skillNameSchema,
});

const parseSkillRouteParams = (params: unknown) => {
  const parsed = skillRouteParamsSchema.safeParse(params);
  return parsed.success ? parsed.data : false;
};

const cancelSkillQueries = async (
  queryClient: ReturnType<typeof useQueryClient>,
  skillName: string
) => {
  await queryClient.cancelQueries({ queryKey: skillDetailQueryKey(skillName) });
  await queryClient.cancelQueries({
    queryKey: skillFileQueryPrefix(skillName),
  });
  await queryClient.cancelQueries({
    queryKey: skillSnapshotsQueryKey(skillName),
  });
};

const invalidateSkillQueries = async (
  queryClient: ReturnType<typeof useQueryClient>,
  skillName: string
) => {
  await queryClient.invalidateQueries({ queryKey: skillListQueryKey });
  await queryClient.invalidateQueries({
    queryKey: skillDetailQueryKey(skillName),
  });
  await queryClient.invalidateQueries({
    queryKey: skillFileQueryPrefix(skillName),
  });
  await queryClient.invalidateQueries({
    queryKey: skillSnapshotsQueryKey(skillName),
  });
};

const removeSkillQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  skillName: string
) => {
  queryClient.removeQueries({ queryKey: skillDetailQueryKey(skillName) });
  queryClient.removeQueries({ queryKey: skillFileQueryPrefix(skillName) });
  queryClient.removeQueries({ queryKey: skillSnapshotsQueryKey(skillName) });
};

const getSnapshotsStatus = (snapshotCount: number, isPending: boolean) => {
  if (isPending) {
    return "Loading snapshots...";
  }

  if (snapshotCount === 0) {
    return "No snapshots yet";
  }

  return `${snapshotCount} snapshots loaded`;
};

/* eslint-disable no-use-before-define -- Route exposes typed route-local hooks from the file route declared below. */
const SkillDetailRoute = () => {
  const { skillName } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  /* eslint-enable no-use-before-define */
  const { path } = search;
  const queryClient = useQueryClient();
  const skillDetail = useSkillDetail(skillName);
  const skill = skillDetail.data;
  const skillSnapshots = useSkillSnapshots(skillName);
  const createSnapshot = useCreateSkillSnapshot(skillName);
  const restoreSnapshot = useRestoreSkillSnapshot(skillName, {
    onSuccess: async (result) => {
      const nextSkillName = result.name;

      if (nextSkillName !== skillName) {
        await queryClient.invalidateQueries({ queryKey: skillListQueryKey });
        await cancelSkillQueries(queryClient, skillName);
        removeSkillQueries(queryClient, nextSkillName);
        await navigate({
          params: { skillName: nextSkillName },
          search: { path },
          to: "/skills/$skillName",
        });
        removeSkillQueries(queryClient, skillName);
        return;
      }

      await invalidateSkillQueries(queryClient, skillName);
    },
  });
  const patchSkill = usePatchSkill(skillName);

  const setSelectedPath = (nextPath: string | undefined) => {
    void navigate({
      params: { skillName },
      search: { path: nextPath === skillFilePath ? undefined : nextPath },
      to: "/skills/$skillName",
    });
  };

  const restore = async (snapshotNumber: number) => {
    await restoreSnapshot.mutateAsync(snapshotNumber);
  };

  const takeSnapshot: Parameters<
    typeof SkillDetailView
  >[0]["onTakeSnapshot"] = async (input) => {
    await createSnapshot.mutateAsync(input);
  };

  const saveChanges: Parameters<
    typeof SkillDetailView
  >[0]["onSaveChanges"] = async (input) => {
    const result = await patchSkill.mutateAsync(input);
    const nextSkillName = result.name;

    if (nextSkillName !== skillName) {
      await cancelSkillQueries(queryClient, skillName);
      await navigate({
        params: { skillName: nextSkillName },
        search: { path },
        to: "/skills/$skillName",
      });
      return;
    }

    await invalidateSkillQueries(queryClient, skillName);
  };
  const snapshots = skillSnapshots.data ?? [];
  const snapshotCount = snapshots.length;
  const snapshotsStatus = getSnapshotsStatus(
    snapshotCount,
    skillSnapshots.isPending
  );

  if (skillDetail.isPending && !skill) {
    return <SkillDetailSkeleton />;
  }

  return (
    <SkillDetailView
      skill={skill}
      snapshots={snapshots}
      snapshotsStatus={snapshotsStatus}
      selectedPath={path}
      onPathChange={setSelectedPath}
      onRestoreSnapshot={restore}
      onSaveChanges={saveChanges}
      onTakeSnapshot={takeSnapshot}
    />
  );
};

export const Route = createFileRoute("/_authenticated/skills/$skillName")({
  component: SkillDetailRoute,
  loader: ({ context, params }) => {
    const { skillName } = params;

    return context.queryClient.ensureQueryData(
      activeSkillQueryOptions(skillName)
    );
  },
  params: {
    parse: parseSkillRouteParams,
    stringify: ({ skillName }) => ({ skillName }),
  },
  validateSearch: zodValidator(skillDetailSearchSchema),
});
