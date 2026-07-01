import {
  safeRelativePathSchema,
  skillNameSchema,
} from "@skillpack/core/primitives";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { cancelManagedSkillCurrentQueries } from "@/features/skills/api/invalidation";
import { activeSkillQueryOptions } from "@/features/skills/api/query-options";
import { useSkillDetail } from "@/features/skills/api/use-skill-detail";
import { usePatchSkill } from "@/features/skills/api/use-skill-mutations";
import { SkillDetailSkeleton } from "@/features/skills/components/skill-page-skeletons";
import { skillFilePath } from "@/features/skills/lib/skill-files";
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
  const patchSkill = usePatchSkill(skillName);

  const setSelectedPath = (nextPath: string | undefined) => {
    void navigate({
      params: { skillName },
      search: { path: nextPath === skillFilePath ? undefined : nextPath },
      to: "/skills/$skillName",
    });
  };

  const saveChanges: Parameters<
    typeof SkillDetailView
  >[0]["onSaveChanges"] = async (input) => {
    const result = await patchSkill.mutateAsync(input);
    const nextSkillName = result.name;

    if (nextSkillName !== skillName) {
      await cancelManagedSkillCurrentQueries(queryClient, skillName);
      await navigate({
        params: { skillName: nextSkillName },
        search: { path },
        to: "/skills/$skillName",
      });
    }
  };
  if (skillDetail.isPending && !skill) {
    return <SkillDetailSkeleton />;
  }

  return (
    <SkillDetailView
      skill={skill}
      selectedPath={path}
      onPathChange={setSelectedPath}
      onSaveChanges={saveChanges}
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
