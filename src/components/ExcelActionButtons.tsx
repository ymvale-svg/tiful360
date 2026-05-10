import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface IconBtnProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  icon: React.ReactNode;
}

function IconActionButton({ onClick, disabled, title, icon }: IconBtnProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          aria-label={title}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

export function ExportExcelButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <IconActionButton
      onClick={onClick}
      disabled={disabled}
      title="ייצוא לאקסל"
      icon={<Download className="w-4 h-4" />}
    />
  );
}

export function ImportExcelButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <IconActionButton
      onClick={onClick}
      disabled={disabled}
      title="ייבוא מאקסל"
      icon={<Upload className="w-4 h-4" />}
    />
  );
}
