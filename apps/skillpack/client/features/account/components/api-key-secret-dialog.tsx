import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ApiKeySecretDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  secret: string | null;
}

export const ApiKeySecretDialog = ({
  onOpenChange,
  open,
  secret,
}: ApiKeySecretDialogProps) => {
  const copySecret = async () => {
    if (!secret) {
      return;
    }

    try {
      await navigator.clipboard.writeText(secret);
      toast.success("API key copied.");
    } catch {
      toast.error("Could not copy API key to clipboard.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save API key</DialogTitle>
          <DialogDescription>This key is shown once.</DialogDescription>
        </DialogHeader>

        <Input readOnly value={secret ?? ""} aria-label="API key secret" />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={!secret}
            onClick={() => {
              void copySecret();
            }}
          >
            <CopyIcon data-icon="inline-start" />
            Copy key
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
