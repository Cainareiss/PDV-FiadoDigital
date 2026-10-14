import type { Request, Response, NextFunction } from "express";
import { DomainError } from "../errors/domain-error.js";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logError } from "../utils/logger.js";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (_req as any).id || (_req as any).requestId || res.locals?.requestId;
  const userId = res.locals?.user?.id;
  logError("Erro", err, { tag: "PDV API", requestId, userId, method: _req.method, path: _req.path });

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: "Dados inválidos",
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  // A concurrent insert or a soft-deleted record can still hit a database constraint.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = JSON.stringify(err.meta?.target ?? "");
    const barcode = /barcode/i.test(target);
    res.status(409).json({
      success: false,
      message: barcode ? "Código de barras já cadastrado" : "Cadastro já existente. Verifique os dados informados.",
      ...(barcode ? { errors: { barcode: ["Código de barras já cadastrado"] } } : {}),
    });
    return;
  }

  const statusCode = err instanceof DomainError ? err.statusCode : 500;
  const message =
    process.env.NODE_ENV === "production" && statusCode === 500 ? "Erro interno" : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    ...(err instanceof DomainError && err.code ? { code: err.code } : {}),
    ...(err instanceof DomainError && err.code === "BARCODE_ALREADY_REGISTERED" ? { errors: { barcode: [message] } } : {}),
  });
}
