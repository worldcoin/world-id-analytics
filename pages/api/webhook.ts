import type { NextApiRequest, NextApiResponse } from "next";
import { PostHog } from "posthog-node";

type Data = {
  name: string;
};

interface EventProps {
  id: string;
  webhookId: string;
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
  "0x0000000000000000000000000000000000000000": "burn",
  "0x8f9b3A2Eb1dfa6D90dEE7C6373f9C0088FeEebAB": "lens",
  // More contracts here...
};

const client = new PostHog(process.env.WORLD_ID_PUBLIC_KEY!);

console.log("---START ADDRESS MONITORING---");

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const webhook = req.body;

  const events: EventProps[] = webhook.event.activity.map(
    (event: {
      fromAddress: any;
      toAddress: any;
      hash: any;
      blockNum: any;
    }) => ({
      id: webhook.id,
      webhookId: webhook.webhookId,
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

  res.status(204).end();
}

client.shutdown();
