import { queryOptions } from "@tanstack/react-query";

import { apiKeyListQueryKey } from "./query-keys";
import { fetchApiKeys } from "./requests";

export const apiKeyListQueryOptions = () =>
  queryOptions({
    queryFn: fetchApiKeys,
    queryKey: apiKeyListQueryKey,
  });
