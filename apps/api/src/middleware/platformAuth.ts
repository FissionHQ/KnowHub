import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";

export function createPlatformAuthMiddleware(platformAdminSecret?: string) {
  return function platformAuth(req: Request, _res: Response, next: NextFunction): void {
    if (!platformAdminSecret) {
      throw new UnauthorizedError("Platform admin is not configured");
    }

    const headerKey = req.headers["x-platform-key"] as string | undefined;
    if (!headerKey || headerKey !== platformAdminSecret) {
      throw new UnauthorizedError("Invalid platform admin key");
    }

    next();
  };
}
