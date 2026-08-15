 # Recharge WebCommand

## Project Overview   Demo - https://www.tella.tv/video/automating-mobile-recharges-with-whatsapp-8jm3

Recharge WebCommand is a tool designed to generate UPI QR codes for Jio mobile recharge plans. It supports both command-line interface (CLI) operations and server operations with integration to WhatsApp via Twilio. The tool parses messages to extract mobile numbers and recharge plans, executes the recharge command, and produces a UPI QR code ready for payment processing.

## File Structure

The main components of the project are located in the `src` directory:

- `index.ts`: Main entry point for command-line operations. Parses input and coordinates the recharge process.
- `intent.ts`: Handles parsing of messages to extract recharge intents.
- `plans.ts`: Defines available recharge plans and utility functions to resolve plan details.
- `server.ts`: Express server definition handling WhatsApp webhook interactions using Twilio.
- `session.ts`: Manages user sessions and states throughout the recharge process.
- `types.ts`: Type definitions used across various modules.
- `webcmd.ts`: Executes the `webcmd` command to initiate the recharge operation.
- `whatsapp-intent.ts`: Additional parsing and utility functions specifically for WhatsApp messages.
- `whatsapp-ui.ts`: Prepares UI texts and responses for WhatsApp interactions.

## Installation

1. **Clone the repository**:
   ```
   git clone <repository-url>
   cd recharge-webcmd
   npm install
   ```

2. **Setup Environment Variables**:
   Copy `.env.example` to `.env` and update the following keys:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_NUMBER`
   - `PUBLIC_BASE_URL`

3. **Run the following to start the server**:
   ```
   npm start
   ```

## Usage

### Command Line Interface

You can run the recharge tool using the CLI as follows:
```
node dist/index.js "recharge my jio number 9466444175 plan 29"
```
Replace the message with the desired command string.

### Server - WhatsApp Integration

- Deploy the server using:
  ```
  npm start
  ```
- Use a tool like `ngrok` to expose your localhost: `ngrok http 3000`
- Ensure Twilio's webhook URL matches the `PUBLIC_BASE_URL` in your environment variables.
- Interact with your WhatsApp connected number to initiate recharge processes.

## Environment Variables

- **TWILIO_ACCOUNT_SID**: Twilio account identifier.
- **TWILIO_AUTH_TOKEN**: Twilio authentication token.
- **TWILIO_WHATSAPP_NUMBER**: The WhatsApp number provided by Twilio.
- **PUBLIC_BASE_URL**: Public URL accessible for the webhook (e.g., from ngrok).

## APIs and Functionality

- **/whatsapp**: Webhook endpoint for WhatsApp messages handling.
- Supports parsing of incoming text to determine recharge numbers and plan execution.

## Contribution

Feel free to contribute by submitting pull requests or opening issues. Follow the code structure and use detailed commit messages for clarity.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
