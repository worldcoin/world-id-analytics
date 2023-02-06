import type { NextApiRequest, NextApiResponse } from "next";

type Data = {
  success: boolean;
  count?: number;
  error?: string;
};

interface Params {
  start: string;
  end: string;
  filterDevPortal: boolean;
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
      "WLD airdrop block claimed",
      "Airdrop level reward claimed",
    ]),
  },
  {
    id: process.env.WORLD_ID_POSTHOG_PROJECT_ID,
    events: new Set(["onchain verification"]),
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
        nullifier_aggregate(where: {created_at: {_gte: $start, _lt: $end}, action: {is_staging: {_eq: false}}}) {
          aggregate {
            count(columns: id, distinct: true)
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
    .then(async (response) => await response.json())
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
  // Secure the endpoint during initial rollout
  if (
    !process.env.ANALYTICS_API_SECRET ||
    req.headers.authorization?.replace("Bearer ", "") !==
      process.env.ANALYTICS_API_SECRET
  ) {
    res.status(401).json({
      success: false,
      error: "You do not have permission to access this resource.",
    });
    return;
  }

  const params: Params = {
    start: req.body.start || "2022-01-01",
    end: req.body.end || new Date().toISOString(),
    filterDevPortal: req.body.filter_dev_portal || false,
    filterWldClaims: req.body.filter_wld_claims || false,
    filterAirdrops: req.body.filter_airdrops || false,
    filterPhones: req.body.filter_phones || false, // Not currently active
    filterTests: req.body.filter_tests || false,
  };

  // Get event totals from developer portal
  let devPortalEventCount = 0;
  if (!params.filterDevPortal) {
    devPortalEventCount = await fetchDevPortalEvents(params)
      .then((data) => {
        return data.data.nullifier_aggregate.aggregate.count;
      })
      .catch((error) => {
        console.error(error);
        res.status(500).json({
          success: false,
          error: "Server-side error occurred, please check the logs!",
        });
      });
  }

  // Filter events retrieved from posthog based on given params
  let filteredEvents = POSTHOG_EVENTS;
  if (params.filterWldClaims)
    filteredEvents[0].events.delete("WLD airdrop block claimed");
  if (params.filterAirdrops)
    filteredEvents[0].events.delete("Airdrop level reward claimed");

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
      res.status(500).json({
        success: false,
        error: "Server-side error occurred, please check the logs!",
      });
    });

  res
    .status(200)
    .json({ success: true, count: devPortalEventCount + postHogEventCount });
}
