# PayPal via Stripe Custom Payment Method (CPM)

PayPal on Stripe Checkout for **AU accounts** uses Stripe’s Custom Payment Method adapter—not the standard EU/UK PayPal integration.

## 1. Request access

1. Read Stripe’s guide: https://docs.stripe.com/payments/payment-methods/custom-payment-methods/paypal  
2. Submit the registration form linked from that page (Stripe emails when approved).  
3. Connect your PayPal business account when Stripe prompts during onboarding.

## 2. Deploy the adapter (after approval)

Stripe provides a container or small service to host on peppertrees alongside the resolver.

```bash
# Enable the optional compose profile once Stripe supplies the image/URL:
docker compose --profile paypal-cpm up -d
```

Set in `.env`:

```env
PAYPAL_CPM_ENABLED=true
PAYPAL_CPM_ADAPTER_URL=http://paypal-cpm:8080
PAYPAL_CPM_PAYMENT_METHOD_CONFIGURATION=pmc_...
```

`PAYPAL_CPM_PAYMENT_METHOD_CONFIGURATION` is the Payment Method Configuration ID from the Stripe Dashboard after CPM is enabled.

## 3. Checkout and webhooks

No SPA changes beyond copy—the same **Buy credit** button opens Stripe Checkout. When CPM is configured, Checkout shows PayPal alongside cards and wallets.

Completed payments still emit `checkout.session.completed` to:

`https://tunebook-resolver-light-ytrp5enyda-ts.a.run.app/billing/webhook`

The resolver records `payment_method: paypal` in ledger detail when detected.

## 4. Live checklist (Stripe + wallets)

- [ ] Switch to live `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- [ ] Dashboard → Payment methods: enable Cards, Google Pay, Apple Pay
- [ ] Dashboard → Payment method domains: register `tunebook.net` (and `www` if used)
- [ ] Webhook endpoint: `checkout.session.completed`
- [ ] Test card + Google Pay on Checkout; confirm credit grant and `/#/billing/success` redirect

## Admin

```bash
cd local-resolver
python3 scripts/billing_admin.py list --provider stripe
python3 scripts/billing_admin.py comp user@example.com 500 --reason "support credit"
```
