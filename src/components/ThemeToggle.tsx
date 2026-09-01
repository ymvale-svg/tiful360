import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "בהיר", Icon: Sun },
  { value: "dark", label: "כהה", Icon: Moon },
  { value: "system", label: "לפי המערכת", Icon: Monitor },
] as const;

/** Light / dark / follow-the-system switch. */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // `theme` is the stored preference ("system" included); `resolvedTheme` is
  // what is actually on screen, which is what the icon should show.
  const ActiveIcon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="p-2 rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="בחירת ערכת נושא"
        >
          <ActiveIcon className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      {/* The document is already dir="rtl", which Radix inherits. */}
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="gap-2 cursor-pointer"
            aria-current={theme === value}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            <span>{label}</span>
            {theme === value && <span className="ms-auto text-primary" aria-hidden="true">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
