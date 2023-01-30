import type { NextApiRequest, NextApiResponse } from "next";

type Data = {
  success: boolean;
  count?: number;
  error?: string;
};

interface Project {
  id: string | undefined;
  events: string[];
}

interface Params {
  start: string;
  end: string;
  filterWldClaims: boolean;
  filterAirdrops: boolean;
  filterPhones: boolean;
  filterTests: boolean;
}

const DEV_PORTAL_URL = "https://developer.worldcoin.org/api/v1/graphql";
const POSTHOG_URL = "https://app.posthog.com/api/projects";
const POSTHOG_EVENTS = [
  {
    id: process.env.WORLD_APP_POSTHOG_PROJECT_ID,
    events: new Set([
      "World ID verification success",
      "WLD airdrop block claimed",
      "Airdrop level reward claimed",
    ]),
  },
  {
    id: process.env.WORLD_ID_POSTHOG_PROJECT_ID,
    events: new Set(["onchain verification", "phone verification verified"]),
  },
];

const fetchDevPortalEvents = async (params: Params) => {
  let headers = new Headers();
  headers.append(
    "Authorization",
    `Bearer ${process.env.DEV_PORTAL_ANALYTICS_KEY!}`
  );
  headers.append("Content-Type", "application/json");

  const options: RequestInit = {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      query: `query VerificationQuery($start: timestamptz, $end: timestamptz) {
        nullifier_aggregate(where: {created_at: {_gte: $start, _lt: $end}}, distinct_on: nullifier_hash) {
          aggregate {
            count(columns: nullifier_hash, distinct: true)
          }
        }
      }`,
      variables: {
        start: params.start,
        end: params.end,
      },
    }),
  };

  return fetch(DEV_PORTAL_URL, options)
    .then((response) => {
      return response.json();
    })
    .catch((error) => {
      console.error(`error: ${error}`);
    });
};

const fetchPosthogEvents = async (id: string, events: any, params: Params) => {
  let headers = new Headers();
  headers.append("Authorization", `Bearer ${process.env.POSTHOG_PRIVATE_KEY!}`);
  headers.append("Content-Type", "application/json");

  const options: RequestInit = {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      events: events,
      date_from: params.start,
      date_to: params.end,
      filter_test_accounts: params.filterTests,
    }),
  };

  return fetch(`${POSTHOG_URL}/${id}/insights/trend`, options)
    .then((response) => {
      return response.json();
    })
    .catch((error) => {
      console.error(`error: ${error}`);
    });
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const params: Params = {
    start: req.body.start || "2022-01-01",
    end: req.body.end || new Date().toISOString(),
    filterWldClaims: req.body.filter_wld_claims || false,
    filterAirdrops: req.body.filter_airdrops || false,
    filterPhones: req.body.filter_phones || false,
    filterTests: req.body.filter_tests || false,
  };

  const devPortalEventCount = await fetchDevPortalEvents(params)
    .then((data) => {
      return data.data.nullifier_aggregate.aggregate.count;
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ success: false, error: error });
    });

  let filteredEvents = POSTHOG_EVENTS;
  if (params.filterWldClaims)
    filteredEvents[0].events.delete("WLD airdrop block claimed");
  if (params.filterAirdrops)
    filteredEvents[0].events.delete("Airdrop level reward claimed");
  if (params.filterPhones)
    filteredEvents[1].events.delete("phone verification verified");

  const postHogEventCount = await Promise.all(
    filteredEvents.map((project) => {
      if (project.id) {
        return fetchPosthogEvents(
          project.id,
          [...project.events].map((event) => {
            return { id: event };
          }),
          params
        );
      }
    })
  )
    .then((data) => {
      // Count total events across projects
      const total = data.reduce((acc, curr) => {
        // Count total events across event types
        const count = curr.result.reduce(
          (a: any, b: { count: number }) => a + b.count,
          0
        );
        return acc + count;
      }, 0);
      return total;
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ success: false, error: error });
    });

  res
    .status(200)
    .json({ success: true, count: devPortalEventCount + postHogEventCount });
}
