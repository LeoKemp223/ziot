import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "local-development-secret-change-before-production"
);

async function token(permissions: string[]) {
  return new SignJWT({
    account: "admin@example.com",
    current_org_id: "org_default",
    permissions
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("usr_admin")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);
}

function request(pathname: string, accessToken: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: {
      cookie: `ziot_access_token=${accessToken}`
    }
  });
}

describe("middleware route permissions", () => {
  it("redirects users without the page permission", async () => {
    const response = await middleware(
      request("/logs", await token(["product:read", "log:read"]))
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/?forbidden=%2Flogs"
    );
  });

  it("allows users with the page permission", async () => {
    const response = await middleware(
      request("/logs", await token(["audit:read"]))
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
