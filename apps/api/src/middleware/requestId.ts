import type { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers["x-request-id"] as string) ?? uuidv4();
  req.headers["x-request-id"] = id;
  res.setHeader("X-Request-Id", id);
  next();
}
