import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { limitarTentativas } from "../src/shared/middlewares/rate-limit";

test("pedidos sem e-mail não compartilham limite global entre IPs", () => {
  const limiter = limitarTentativas(1);
  let passou = 0;
  const res = {
    setHeader: () => {}, status: () => res, json: () => res,
  } as unknown as Response;
  for (const ip of ["1", "2"]) limiter({ ip } as Request, res, () => { passou++; });
  assert.equal(passou, 2);
});

test("limite por e-mail impede tentativas distribuídas entre IPs", () => {
  const limiter = limitarTentativas(2);
  let passou = 0;
  let status = 0;
  let retry: unknown;
  const res = {
    setHeader: (_nome: string, valor: unknown) => { retry = valor; },
    status: (valor: number) => { status = valor; return res; }, json: () => res,
  } as unknown as Response;
  for (const ip of ["1", "2", "3"]) {
    limiter({ ip, body: { email: " Usuario@Example.com " } } as Request, res, () => { passou++; });
  }
  assert.equal(passou, 2);
  assert.equal(status, 429);
  assert.ok(Number(retry) > 0);
});

test("limite por IP impede rotação de e-mails", () => {
  const limiter = limitarTentativas(1);
  let passou = 0;
  let status = 0;
  const res = {
    setHeader: () => {}, status: (valor: number) => { status = valor; return res; }, json: () => res,
  } as unknown as Response;
  for (const email of ["a@example.com", "b@example.com"]) {
    limiter({ ip: "1", body: { email } } as Request, res, () => { passou++; });
  }
  assert.equal(passou, 1);
  assert.equal(status, 429);
});
