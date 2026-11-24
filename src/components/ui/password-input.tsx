"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Input } from "./input";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Password field with a real, localized show/hide toggle. */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const t = useTranslations("auth.common");
  const actionLabel = visible ? t("hidePassword") : t("showPassword");

  return (
    <div className="relative" dir={props.dir}>
      <Input {...props} type={visible ? "text" : "password"} className={cn("pe-10", className)} />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={actionLabel}
        aria-pressed={visible}
        title={actionLabel}
        className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-muted transition-colors hover:text-foreground"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
