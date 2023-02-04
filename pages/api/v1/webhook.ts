import * as crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { PostHog } from "posthog-node";
import getRawBody from "raw-body";

type Data = {
  name: string;
};

interface EventProps {
  timestamp: Date;
  contract: string;
  network: string;
  fromAddress: string;
  toAddress: string;
  transactionHash: string;
  block: string;
}

interface Contracts {
  [key: string]: string;
}

const contracts: Contracts = {
  "0x8f9b3A2Eb1dfa6D90dEE7C6373f9C0088FeEebAB": "lens",
  // More contracts here...
};

const client = new PostHog(process.env.WORLD_ID_POSTHOG_PROJECT_KEY!);

// Implemention from: https://docs.alchemy.com/reference/notify-api-quickstart#example-signature-validation
function isValidSignatureForStringBody(
  body: string,
  signature: string
): boolean {
  const hmac = crypto.createHmac(
    "sha256",
    process.env.ALCHEMY_SIGNING_KEY as string
  );
  hmac.update(body, "utf8");
  const digest = hmac.digest("hex");
  return signature === digest;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const rawBody = await getRawBody(req).then((buf) => buf);
  const signature = req.headers["x-alchemy-signature"];

  // Verify the webhook request came from Alchemy
  if (!isValidSignatureForStringBody(rawBody.toString(), signature as string)) {
    return res.status(401).end();
  }

  const webhook = JSON.parse(rawBody.toString());

  const events: EventProps[] = webhook.event.activity.map(
    (event: {
      fromAddress: any;
      toAddress: any;
      hash: any;
      blockNum: any;
    }) => ({
      timestamp: webhook.createdAt,
      contract: contracts[event.toAddress] || "unknown",
      network: webhook.event.network,
      fromAddress: event.fromAddress,
      toAddress: event.toAddress,
      transactionHash: event.hash,
      block: event.blockNum,
    })
  );

  console.log(`INCOMING REQUEST: ${webhook.id}, ${events.length} events`);

  events.forEach((event) => {
    client.capture({
      distinctId: event.fromAddress,
      event: `onchain verification`,
      properties: event,
    });
  });

  console.log(`Processed ${events.length} events from webhook ${webhook.id}`);
  return res.status(204).end();
}

client.shutdown();
