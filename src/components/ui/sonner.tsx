import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { hebrewizeNode } from "@/lib/hebrewError";

// Every error toast in the app is shown to the user in Hebrew.
const t = toast as typeof toast & { __he?: boolean };
if (!t.__he) {
  const orig = toast.error;
  t.error = ((msg: Parameters<typeof orig>[0], opts?: Parameters<typeof orig>[1]) =>
    orig(hebrewizeNode(msg), opts && { ...opts, description: hebrewizeNode(opts.description) })) as typeof orig;
  t.__he = true;
}

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      duration={5000}
      toastOptions={{
        duration: 5000,
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
