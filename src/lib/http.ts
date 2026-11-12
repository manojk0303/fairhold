import "server-only";
import { NextResponse } from "next/server";
import { PayPalError } from "./paypal";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function handle(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PayPalError) {
      console.error("PayPal error", e.status, JSON.stringify(e.details));
      return fail(e.message, e.status >= 500 ? 502 : 400);
    }
    console.error(e);
    return fail((e as Error).message || "Something went wrong", 500);
  }
}
