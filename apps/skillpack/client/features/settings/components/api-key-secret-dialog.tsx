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

    await navigator.clipboard.writeText(secret);
    toast.success("API key copied.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save this API key</DialogTitle>
          <DialogDescription>
            This is the only time the full key will be shown.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input readOnly value={secret ?? ""} aria-label="API key secret" />
          <p className="text-sm text-muted-foreground">
            Store it somewhere secure before closing this dialog.
          </p>
        </div>

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
