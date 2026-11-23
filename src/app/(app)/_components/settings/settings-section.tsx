import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SettingFieldMetadata } from "./settings-form";
import { SettingsForm } from "./settings-form";

export function SettingsSection({
  title,
  subtitle,
  fields,
  canEdit,
  children,
}: {
  title: string;
  subtitle?: string;
  fields: SettingFieldMetadata[];
  canEdit: boolean;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        {subtitle ? <p className="text-xs leading-5 text-muted">{subtitle}</p> : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
        <SettingsForm fields={fields} canEdit={canEdit} />
      </CardContent>
    </Card>
  );
}
