import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getApiErrorMessage } from "./client";

const defaultQueryStaleTimeMs = 30_000;

const notifyQueryError = async (error: unknown) => {
  toast.error(await getApiErrorMessage(error));
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: defaultQueryStaleTimeMs,
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      void notifyQueryError(error);
    },
  }),
});
