# NImpatech data bundles

Storefront and reseller portal for **MTN**, **Telecel**, and **AirtelTigo** bundles in Ghana.

You do not need to write code to run this. Follow the steps below.

## What you need

1. [Node.js](https://nodejs.org/) (version 18 or newer)
2. A code editor such as Cursor (already installed)

## How to start the website

1. Open a terminal in this folder.
2. Install packages:

```bash
npm install
```

3. Copy the example environment file and keep the default values for now:

```bash
copy .env.example .env
```

On Mac/Linux use `cp .env.example .env`.

4. Start the server:

```bash
npm start
```

5. Open your browser and visit: [http://localhost:3000](http://localhost:3000)

## How the site works

1. Customer chooses a network and bundle on the home or checkout page.
2. They enter a Ghana phone number.
3. The backend creates an order.
4. When you add your payment keys, the customer pays (MoMo / card).
5. After payment succeeds, the backend calls your VTU API to send the data bundle.

Orders are stored in Supabase. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run `supabase-schema.sql` in the Supabase SQL Editor before starting the storefront. Without Paystack credentials, checkout can create a demo order, but demo payments are not treated as paid or delivered.

Customers can track only an individual order by entering its private order reference on the home page. Treat that reference like a password and share it only with the customer; there is no public all-orders or sales-total endpoint.

## Payment and data delivery

Set these values in `.env`:

- Payment: `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` (or switch provider in `src/services/paymentService.js`)
- Paystack webhook: configure `https://YOUR_DOMAIN/api/webhooks/payment` in the Paystack dashboard. Test with Paystack test keys and a public HTTPS test URL before switching both checkout and webhook verification to live keys.
- Production callback: set `PAYMENT_CALLBACK_URL=https://YOUR_DOMAIN/success.html` in the production host environment. Replace `YOUR_DOMAIN` with the exact deployed hostname; `localhost` cannot receive Paystack redirects or webhooks.
- Data delivery: set `VTU_PROVIDER=datamart`, `DATAMART_API_KEY`, and `DATAMART_API_SECRET` in `.env`. Datamart receives both keys in `X-API-Key` and `X-API-Secret` headers.
- NImpatech email receipts: configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `RECEIPT_FROM` in `.env`. Receipts are sent after Paystack payment verification, separately from Paystack's own email. Customer email is optional; customers who leave it blank can print the receipt from the confirmation page.

Datamart orders are created with `POST /api/developer/purchase`. MTN maps to `YELLO`, Telecel to `TELECEL`, and AirtelTigo to `AT_PREMIUM`; purchases use the provider wallet and `sam-` reference prefix. Pending provider statuses do not auto-refresh because no Datamart status endpoint has been configured yet.

Ready-to-edit files:

- `src/services/paymentService.js` — start payment and verify payment
- `src/services/vtuService.js` — send the bundle after payment
- `src/config/bundles.js` — prices and bundle sizes
- `src/config/networks.js` — MTN, Telecel, AirtelTigo prefixes

## Sub-agent portal

The recruitment page is available at `/agents`. The one-time joining fee is GHS 50 and is verified through Paystack before an account activates. Agents set customer prices above the supplied base prices; wallet profit is credited only after Justice confirms delivery.

Storefront orders and sub-agent activity both use Supabase. To set up persistent storage:

1. Create or open a Supabase project and run `supabase-schema.sql` in its SQL Editor.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` for server-side storefront order storage.
3. Also set `SUPABASE_ANON_KEY` to enable agent authentication. Keep the service-role key private and set server credentials in the production host environment before deploying.
4. Restart the server. The `/agents` page stays in setup mode until the agent credentials are configured.

The storefront order table is protected by row-level security and server-only service-role access. Order payment and delivery states persist across restarts. `processing`, `delivery_review`, and `delivery_failed` orders remain available for reconciliation; do not blindly resend a bundle when supplier acceptance is uncertain.


## Project folders

```
public/          website pages (HTML, CSS, JS)
src/server.js    starts Express
src/routes/      API endpoints
src/services/    payment and VTU connectors
src/config/      networks and bundle list
```
