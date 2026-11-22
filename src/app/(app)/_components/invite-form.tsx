"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createInvitationAction, type ActionState } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteSchema } from "@/core/auth/schemas";
import { readActionState } from "../../(auth)/_components/form-utils";

export function InviteForm() {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(createInvitationAction, {} as ActionState);
  const info = readActionState(state);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>{t("invitation.createTitle")}</CardTitle>
        <p className="text-sm leading-6 text-muted">{t("invitation.createSubtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {info.status === "error" ? <Alert tone="error">{t("errors.generic")}</Alert> : null}
        {info.status === "success" ? (
          <Alert tone="success">
            {t("invitation.created")}
            {info.acceptUrl ? (
              <span className="mt-2 block text-xs">
                {t("invitation.acceptLink")}:{" "}
                <a href={info.acceptUrl} className="break-all text-accent underline">
                  {info.acceptUrl}
                </a>
              </span>
            ) : null}
          </Alert>
        ) : null}

        <form
          action={formAction}
          onSubmit={(event) => {
            setError(null);
            if (!inviteSchema.safeParse({ email, role }).success) {
              event.preventDefault();
              setError(t("errors.generic"));
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">{t("invitation.email")}</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              autoComplete="email"
              dir="ltr"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">{t("invitation.role")}</Label>
            <select
              id="invite-role"
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="h-10 w-full rounded-md border bg-surface px-3 text-sm text-foreground"
            >
              <option value="member">{t("invitation.roles.member")}</option>
              <option value="admin">{t("invitation.roles.admin")}</option>
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            {t("invitation.createSubmit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
