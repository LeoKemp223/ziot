"use client";

import { useEffect, useMemo, useState } from "react";

type MeResponse = {
  code: number;
  data?: {
    permissions: string[];
  };
};

export function usePermissions() {
  const [permissions, setPermissions] = useState<string[] | null>(null);

  useEffect(() => {
    void fetch("/api/v1/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<MeResponse>)
      .then((body) => {
        setPermissions(body.code === 0 && body.data ? body.data.permissions : []);
      })
      .catch(() => setPermissions([]));
  }, []);

  return useMemo(() => {
    const permissionSet = new Set(permissions ?? []);

    return {
      permissions,
      isLoaded: permissions !== null,
      hasPermission: (permission: string) => permissionSet.has(permission),
      hasAnyPermission: (requiredPermissions: string[]) =>
        requiredPermissions.some((permission) => permissionSet.has(permission))
    };
  }, [permissions]);
}
