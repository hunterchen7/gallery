import { generateApiKey, encrypt } from "../src/lib/auth";
import * as readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise((res) => rl.question(q, res));

async function main() {
  const password = await ask("Enter a password for encrypting the API key: ");
  if (!password) {
    console.error("Password cannot be empty.");
    process.exit(1);
  }

  const apiKey = generateApiKey();
  const encrypted = await encrypt(apiKey, password);

  console.log("\n--- Add these to your .env file ---\n");
  console.log(`API_KEY=${apiKey}`);
  console.log(`ENCRYPTED_API_KEY=${encrypted}`);
  console.log("\n--- Remember your password! You'll use it to log in. ---");

  rl.close();
}

main();
