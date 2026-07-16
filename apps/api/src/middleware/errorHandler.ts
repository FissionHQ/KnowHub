import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.headers["x-request-id"] as string;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error("Application error", { err, requestId, path: req.path });
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  logger.error("Unhandled error", {
    err,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    requestId,
    path: req.path,
  });
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
}
