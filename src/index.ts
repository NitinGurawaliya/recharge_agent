import { parseMessage } from "./intent";
import { PLANS, supportedPlansHelp } from "./plans";
import { runJioRecharge } from "./webcmd";

function main(): void {
  const sample = "recharge my jio number 9466444175 plan 29";
  const message = process.argv.slice(2).join(" ").trim() || sample;

  console.log("Message:", message);
  console.log("Supported plans:", supportedPlansHelp());

  let intent;
  try {
    intent = parseMessage(message);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const planMeta = PLANS[intent.plan as keyof typeof PLANS];
  console.log("Detected number:", intent.number);
  console.log(
    "Detected plan:",
    intent.plan,
    planMeta ? `(${planMeta.planName})` : "",
  );
  console.log(`Running webcmd jio recharge ${intent.number} ${intent.plan}...`);

  let result;
  try {
    result = runJioRecharge(intent.number, intent.plan);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  console.log("");
  console.log("=== Jio Recharge QR Ready ===");
  console.log(`Number:     ${result.number}`);
  console.log(`Plan:       ${result.plan_name}`);
  console.log(`Data:       ${result.plan_data}`);
  console.log(`Validity:   ${result.plan_validity}`);
  console.log(`Amount:     Rs ${result.amount}`);
  console.log(`QR image:   ${result.qr_image_path}`);
  console.log(`UPI URI:    ${result.upi_uri}`);
  console.log("");
  console.log("Scan the QR with any UPI app to complete payment.");
  console.log("(This tool stops at QR generation - it does not scan or submit payment.)");
}

main();
