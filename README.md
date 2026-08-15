# RechargeAgent - demo - https://www.tella.tv/video/automating-mobile-recharges-with-whatsapp-8jm3

> **Running out of Jio data? Just WhatsApp your number and plan. RechargeAgent finds the Data Pack, reaches the Jio QR payment screen, and sends the UPI QR back to WhatsApp — no need to open the Jio website.**

## What is RechargeAgent?

RechargeAgent is a **WhatsApp-based Jio Data Pack recharge agent**.

When mobile data is running low, users normally have to leave WhatsApp, open a recharge website/app, enter their number, find a Data Pack, navigate through checkout, and reach the payment screen. RechargeAgent removes that friction.

The user stays inside WhatsApp:

```text
WhatsApp → Jio number → Data Pack → Jio automation → UPI QR → User pays → Recharge complete
```

The agent **does not make the payment itself**. It stops at the QR payment screen and gives the user the UPI QR so the user can authorize and complete the payment.

## The Problem

A simple data top-up can require several manual steps:

1. Leave WhatsApp.
2. Open Jio's recharge website.
3. Enter the mobile number.
4. Find the correct Data Pack.
5. Select the plan.
6. Navigate through checkout.
7. Find the QR payment option.
8. Scan and pay.

RechargeAgent turns the navigation part into a conversation.

> **"I need a ₹19 data pack."**
>
> RechargeAgent handles the website interaction and returns the payment QR.

## How It Works

1. **Start:** User sends `Hi` on WhatsApp.
2. **Number:** User sends a 10-digit Jio number.
3. **Plan:** User replies with a supported Data Pack amount such as `19`.
4. **Automation:** The custom Webcmd adapter opens Jio, enters the number, loads the plans, selects the Data Packs category and requested plan, and navigates to the QR payment screen.
5. **QR extraction:** The adapter extracts the QR image and UPI URI without making the payment.
6. **Delivery:** The backend exposes the QR image and sends it back through Twilio WhatsApp.
7. **Payment:** The user scans the QR, authorizes the UPI payment, and completes the recharge.

## Architecture

```text
                         ┌──────────────────┐
                         │     WhatsApp     │
                         │      User        │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │      Twilio      │
                         │ WhatsApp Sandbox │
                         └────────┬─────────┘
                                  │ POST /whatsapp
                                  ▼
                    ┌──────────────────────────┐
                    │     RechargeAgent API    │
                    │   Node.js + Express      │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │   Custom Webcmd Adapter  │
                    │       Jio Recharge       │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                         ┌──────────────────┐
                         │   Jio Website    │
                         └────────┬─────────┘
                                  │
                         Data Pack + QR
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ UPI QR + URI     │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │     WhatsApp     │
                         └──────────────────┘
```

## Tech Stack

- **Backend:** Node.js, TypeScript, Express
- **Messaging:** Twilio WhatsApp
- **Browser agent:** `@agentrhq/webcmd`
- **Automation:** Custom Jio Webcmd adapter + Chromium
- **Deployment:** Railway + Docker
- **Server browser environment:** Xvfb
- **Local development:** ngrok

## Supported Plans

RechargeAgent currently focuses on **Jio Data Packs**.

| Plan | Amount | Data | Validity |
|---|---:|---|---|
| MRP 19 | ₹19 | 1GB | 1 Day |
| MRP 29 | ₹29 | 2GB High Speed Data | 2 Days |
| Data Only Pack 39 | ₹39 | 3GB/Day | 3 Days |
| Unlimited Data Pack | ₹49 | Unlimited Data | 1 Day |
| Data Only Pack 69 | ₹69 | 6GB | 7 Days |
| Data Only Pack 139 | ₹139 | 12GB | 7 Days |
| Data Only Pack 219 | ₹219 | 30GB | 30 Days |

> **Scope:** The adapter intentionally focuses on the Data Packs category. Other Jio plan categories are outside the current scope.
>
> **Verification:** ₹19 and ₹29 were individually click-verified end-to-end during development. Other listed plans follow the same Data Packs checkout pattern and should be re-verified before a live demo.

## Project Structure

```text
recharge-webcmd/
│
├── jio/
│   └── recharge.js              # Custom Jio Webcmd adapter
│
├── scripts/
│   └── install-webcmd-jio.js    # Installs adapter into Webcmd
│
├── src/
│   ├── index.ts
│   ├── intent.ts
│   ├── plans.ts
│   ├── server.ts                # Express + WhatsApp webhook
│   ├── session.ts               # Conversation/job state
│   ├── types.ts
│   ├── webcmd.ts                # Webcmd bridge
│   ├── whatsapp-intent.ts
│   └── whatsapp-ui.ts
│
├── qr-codes/                    # Generated QR artifacts
├── Dockerfile
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

## Core Components

### `src/server.ts`

Responsible for:

- receiving Twilio WhatsApp webhooks
- parsing incoming messages
- recognizing greetings, numbers and plans
- maintaining conversation state
- starting recharge jobs
- waiting briefly for QR generation
- serving generated QR images
- returning TwiML responses

Endpoints:

```text
GET  /
POST /whatsapp
GET  /qr-codes/:file
```

### `src/webcmd.ts`

Bridges the WhatsApp application to the custom Webcmd adapter. It validates the number, resolves the plan, runs `webcmd jio recharge`, parses the JSON result, and copies the QR into `qr-codes/`.

### `jio/recharge.js`

Registers:

```text
webcmd jio recharge <number> [plan]
```

The automation follows:

```text
Jio recharge page
      ↓
Enter mobile number
      ↓
Load plans
      ↓
Data Packs
      ↓
Select requested plan
      ↓
Jio checkout
      ↓
Pay via QR
      ↓
QR payment page
      ↓
Extract QR canvas
      ↓
Return UPI URI + QR image
```

The adapter intentionally stops at the QR screen and **never performs the payment**.

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env`:

```env
PORT=3000

TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

PUBLIC_BASE_URL=https://your-ngrok-url.ngrok-free.app

# Optional interactive plan picker
TWILIO_LIST_PICKER_SID=optional_content_sid
```

Never commit real credentials or `.env` to GitHub.

### 3. Start the server

```bash
npm run server
```

The startup script installs the custom adapter and then starts Express.

### 4. Expose the local server

```bash
ngrok http 3000
```

Set the HTTPS ngrok URL as `PUBLIC_BASE_URL` and configure the Twilio WhatsApp webhook as:

```text
POST https://your-ngrok-url.ngrok-free.app/whatsapp
```

## Test the Agent Directly

You can test the Jio automation without WhatsApp:

```bash
webcmd jio recharge 9466444175 19 -f json
```

A successful result looks like:

```json
{
  "status": "qr_generated",
  "number": "9466444175",
  "amount": 19,
  "plan_name": "MRP 19",
  "plan_validity": "1 Day",
  "plan_data": "1GB Data",
  "upi_uri": "upi://pay?...",
  "qr_image_path": "..."
}
```

This direct test is useful for separating the Jio/browser automation layer from the WhatsApp/Twilio layer.

## Example WhatsApp Flow

```text
User: Hi

Agent: Hey! I can generate a Jio recharge UPI QR for you.
       Send the 10-digit Jio number.

User: 9466444175

Agent: Number saved: 9466444175
       Available plans...

User: 19

Agent: Got it — generating UPI QR...

Agent: [QR IMAGE]
       MRP 19 | Rs 19
       1GB Data | 1 Day
       UPI link: upi://pay?...
```

The user then scans the QR and completes the payment.

## Why This Is an Agent

The user supplies an intent such as:

```text
"I need a ₹19 Jio Data Pack."
```

The agent performs a multi-step action on the user's behalf:

```text
Understand request
      ↓
Identify number
      ↓
Resolve plan
      ↓
Navigate Jio
      ↓
Find Data Pack
      ↓
Select plan
      ↓
Navigate checkout
      ↓
Find QR payment
      ↓
Extract payment QR
      ↓
Return result
```

The user does not need to know or perform those intermediate website actions.

## Payment Boundary

RechargeAgent **does not automatically pay** for a recharge.

The automation stops at:

```text
Jio → Pay via QR
```

It extracts the payment information and returns the QR. The user remains in control of the final payment by scanning and authorizing the UPI payment.

## Deployment

The project can be deployed to Railway using the included Dockerfile.

The Docker image provides Linux libraries required by Chromium and installs **Xvfb**, allowing the browser automation to run in a server environment without a physical display.

Deployment flow:

```text
GitHub
   ↓
Railway
   ↓
Docker build
   ↓
Node application
   ↓
Webcmd + Jio adapter
   ↓
Chromium + Xvfb
```

The custom adapter is installed during startup with:

```bash
node scripts/install-webcmd-jio.js
```

The application then starts with:

```bash
npm run server
```

For Railway, the application should listen on the Railway-provided `PORT`.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | Railway-provided | Server listening port |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio authentication |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio authentication |
| `TWILIO_WHATSAPP_NUMBER` | Yes | WhatsApp sender |
| `PUBLIC_BASE_URL` | Yes | Public HTTPS URL used for QR images |
| `TWILIO_LIST_PICKER_SID` | Optional | WhatsApp interactive plan picker |

## Current Limitations

### Jio only

The current adapter is specifically built for Jio.

### Data Packs only

The project intentionally supports Data Packs rather than every Jio recharge category.

### User-authorized payment

The agent generates and delivers the QR but does not automatically complete the payment.

### Provider messaging limits

Twilio/WhatsApp messaging limits can affect testing independently of the application. During development, the Twilio account reached **error 63038 (daily messages limit)**, causing outbound replies to fail even though the webhook and application were working correctly.

### Browser automation depends on the website

The adapter relies on the current Jio website UI, checkout flow, and QR canvas. Website changes may require adapter updates.

### Plan availability

A plan may not be available for every mobile number. The adapter checks the plan catalog for the supplied number before continuing.

## Development & Deployment Lessons

A major engineering challenge was making browser automation work outside a local desktop environment.

### Local

Windows provides a graphical environment, so Chromium could launch normally.

### Railway

Railway runs inside a Linux container without a desktop display. The production setup therefore required:

- Chromium system dependencies
- Docker
- Xvfb
- custom Webcmd adapter packaging

The Jio adapter was initially available only under the developer's local Webcmd directory. For reproducible deployment it was moved into the repository as `jio/recharge.js` and installed during startup.

## Hackathon Story

### The problem

> **"My data is almost over. Why do I have to leave WhatsApp, open a website, find a plan, and navigate a whole checkout flow just to buy a small data pack?"**

### The solution

> **RechargeAgent turns that navigation process into a WhatsApp conversation.**

### The experience

```text
Need data?
   ↓
WhatsApp the agent
   ↓
Number + plan
   ↓
Receive QR
   ↓
Pay
   ↓
Done
```

The goal is not to replace payment authorization. The goal is to remove everything unnecessary **before payment**.

## Future Improvements

- Automatically discover and validate more Jio Data Packs
- Improve WhatsApp interactive plan selection
- Support additional telecom providers
- Add persistent conversation state
- Add payment confirmation/status handling
- Improve browser resilience against website UI changes
- Add monitoring and structured production logs
- Add retry/recovery for transient browser failures
- Add automated end-to-end tests for supported plans

## Built With Codex

Codex was used as an active development partner throughout the project. It helped with:

- application architecture
- TypeScript/Express backend development
- WhatsApp conversation flow
- Twilio integration
- custom Webcmd Jio adapter development
- QR extraction
- browser automation debugging
- packaging the custom adapter for deployment
- Docker configuration for Chromium
- Linux browser dependency troubleshooting
- Xvfb configuration for server-side browser execution
- Railway deployment debugging
- error handling and production diagnostics

The project was developed iteratively: **build → test → inspect real logs → identify the failing layer → fix → redeploy**.

## Project Status

**Hackathon prototype / demo**

Core flow:

```text
WhatsApp message
      ↓
Jio number
      ↓
Data Pack selection
      ↓
Jio browser automation
      ↓
QR generation
      ↓
UPI QR delivery
      ↓
User payment
```

The Jio Webcmd flow has been successfully verified locally for the ₹19 Data Pack, including QR generation and extraction.

## License

ISC
