import "server-only";

/**
 * Thin PayPal REST client (sandbox). Covers the money-movement primitives Fairhold needs:
 * Orders v2 (intent=AUTHORIZE), Payments v2 authorizations (capture / partial capture / void /
 * reauthorize), Payouts v1, and webhook signature verification.
 */

const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

let cachedToken: { value: string; expiresAt: number } | null = null;

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: unknown,
  ) {
    super(message);
  }
}

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new PayPalError("PayPal credentials are not configured", 500, null);
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new PayPalError("PayPal auth failed", res.status, json);
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

async function pp<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown; requestId?: string } = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg =
      json?.details?.[0]?.description || json?.message || json?.error_description || res.statusText;
    throw new PayPalError(`PayPal ${init.method ?? "GET"} ${path} failed: ${msg}`, res.status, json);
  }
  return json as T;
}

const money = (value: number, currency: string) => ({
  currency_code: currency,
  value: value.toFixed(2),
});

/** Create an order whose funds will be AUTHORIZED (held), not captured. */
export async function createHoldOrder(opts: {
  referenceId: string;
  description: string;
  amount: number;
  currency: string;
}) {
  return pp<{ id: string; status: string }>("/v2/checkout/orders", {
    method: "POST",
    requestId: `order-${opts.referenceId}-${Date.now()}`,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: opts.referenceId,
          custom_id: opts.referenceId,
          description: opts.description.slice(0, 127),
          soft_descriptor: "FAIRHOLD",
          amount: money(opts.amount, opts.currency),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Fairhold",
            shipping_preference: "NO_SHIPPING",
            user_action: "CONTINUE",
          },
        },
      },
    },
  });
}

type Authorization = { id: string; status: string; expiration_time?: string };

export async function authorizeOrder(orderId: string) {
  const order = await pp<{
    id: string;
    status: string;
    payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
    purchase_units: { payments?: { authorizations?: Authorization[] } }[];
  }>(`/v2/checkout/orders/${orderId}/authorize`, {
    method: "POST",
    requestId: `auth-${orderId}`,
    body: {},
  });
  const auth = order.purchase_units[0]?.payments?.authorizations?.[0];
  if (!auth) throw new PayPalError("No authorization returned", 500, order);
  return { order, authorization: auth };
}

export async function getOrder(orderId: string) {
  return pp(`/v2/checkout/orders/${orderId}`);
}

/** Capture part (or all) of a held authorization. final_capture=true releases the remainder. */
export async function captureAuthorization(opts: {
  authorizationId: string;
  amount: number;
  currency: string;
  invoiceId: string;
  note: string;
}) {
  return pp<{ id: string; status: string }>(
    `/v2/payments/authorizations/${opts.authorizationId}/capture`,
    {
      method: "POST",
      requestId: `capture-${opts.invoiceId}`,
      body: {
        amount: money(opts.amount, opts.currency),
        final_capture: true,
        invoice_id: opts.invoiceId,
        note_to_payer: opts.note.slice(0, 255),
      },
    },
  );
}

export async function voidAuthorization(authorizationId: string) {
  return pp(`/v2/payments/authorizations/${authorizationId}/void`, {
    method: "POST",
    requestId: `void-${authorizationId}`,
  });
}

export async function getAuthorization(authorizationId: string) {
  return pp<Authorization>(`/v2/payments/authorizations/${authorizationId}`);
}

/** Send the freelancer's share via Payouts. */
export async function sendPayout(opts: {
  batchId: string;
  receiver: string;
  amount: number;
  currency: string;
  note: string;
}) {
  return pp<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
    "/v1/payments/payouts",
    {
      method: "POST",
      requestId: `payout-${opts.batchId}`,
      body: {
        sender_batch_header: {
          sender_batch_id: opts.batchId,
          email_subject: "You've been paid through Fairhold",
          email_message: opts.note.slice(0, 1000),
        },
        items: [
          {
            recipient_type: "EMAIL",
            receiver: opts.receiver,
            amount: { value: opts.amount.toFixed(2), currency: opts.currency },
            note: opts.note.slice(0, 4000),
            sender_item_id: opts.batchId,
          },
        ],
      },
    },
  );
}

export async function getPayoutBatch(batchId: string) {
  return pp<{
    batch_header: { batch_status: string };
    items?: { transaction_status?: string; payout_item_id?: string }[];
  }>(`/v1/payments/payouts/${batchId}`);
}

export async function verifyWebhook(headers: Headers, body: unknown) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const res = await pp<{ verification_status: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: {
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: body,
      },
    },
  );
  return res.verification_status === "SUCCESS";
}
